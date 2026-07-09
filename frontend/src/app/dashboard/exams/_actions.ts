'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';
import type { Json } from '@/lib/supabase/types';

// 세션 전체 재채점 — 자동 채점(객관식·단답) + 수동 점수 합산
async function recalculateSession(sessionId: string): Promise<void> {
  const s = createAdminClient();

  const { data: joined } = await s
    .from('exam_responses')
    .select(
      'id, question_id, answer_value, manual_score, exam_questions(id, type, score, correct)'
    )
    .eq('session_id', sessionId);

  type Row = {
    id: string;
    question_id: string;
    answer_value: Record<string, unknown> | null;
    manual_score: number | null;
    exam_questions: { id: string; type: string; score: number; correct: unknown } | null;
  };
  const rows = (joined ?? []) as unknown as Row[];

  let autoScore = 0;
  let manualScore = 0;
  let taskTotal = 0;
  let taskGraded = 0;

  for (const r of rows) {
    const q = r.exam_questions;
    if (!q) continue;
    const ans = r.answer_value;

    if (q.type === 'multiple_choice') {
      const correctKey = (q.correct as { key?: string } | null)?.key;
      if (correctKey && ans && (ans as { key?: string }).key === correctKey) {
        autoScore += q.score;
      }
    } else if (q.type === 'short_text') {
      const keywords = ((q.correct as { keywords?: string[] } | null)?.keywords ?? []).map((k) =>
        k.trim().toLowerCase()
      );
      const text = String((ans as { text?: string } | null)?.text ?? '')
        .trim()
        .toLowerCase();
      if (text && keywords.some((k) => text === k)) autoScore += q.score;
    } else if (q.type === 'task_based') {
      taskTotal++;
      if (r.manual_score != null) {
        taskGraded++;
        manualScore += r.manual_score;
      }
    }
  }

  const allTaskGraded = taskTotal === 0 || taskGraded === taskTotal;
  const totalScore = allTaskGraded ? autoScore + manualScore : null;

  // status는 최종 제출 시점부터 'submitted' 하나로 유지 (채점 완료 여부는 total_score로 구분).
  await s
    .from('exam_sessions')
    .update({
      auto_score: autoScore,
      manual_score: manualScore,
      total_score: totalScore
    })
    .eq('id', sessionId);
}

export async function saveManualScore(input: {
  examId: string;
  sessionId: string;
  questionId: string;
  // 단일 총점 채점 (rubric 없는 문항용). rubric_scores와 배타.
  score?: number;
  // 항목별 세부 점수 (rubric 기반 채점용). 관리자가 100점 기준으로 입력.
  // 저장 시 문항 만점(예: 45)에 맞춰 스케일링해서 manual_score로 저장.
  rubric_scores?: Record<string, number>;
  feedback?: string | null;
}): Promise<{ error?: string }> {
  if (!(await isDeveloper())) return { error: '권한이 없습니다.' };

  const s = createAdminClient();

  const { data: q } = await s
    .from('exam_questions')
    .select('score, correct')
    .eq('id', input.questionId)
    .maybeSingle();
  if (!q) return { error: '문항이 없습니다.' };

  // rubric 기반이면 합계 산출 + 스케일링
  let finalScore: number;
  let scaledFromRubric = false;
  if (input.rubric_scores) {
    const rubric = ((q.correct as { rubric?: { id: string; label?: string; max: number }[] } | null)?.rubric) ?? [];
    const rubricMax = rubric.reduce((sum, r) => sum + r.max, 0) || 100;
    // 각 항목 범위 검증
    for (const r of rubric) {
      const v = input.rubric_scores[r.id];
      if (v == null) continue;
      if (v < 0 || v > r.max) {
        return { error: `${r.label ?? r.id} 항목 점수는 0~${r.max} 범위여야 합니다.` };
      }
    }
    const raw = rubric.reduce((sum, r) => sum + (input.rubric_scores?.[r.id] ?? 0), 0);
    // 스케일링: rubric 100점 → 문항 만점(예: 45점)
    finalScore = Math.round((raw * q.score) / rubricMax);
    scaledFromRubric = true;
  } else if (input.score != null) {
    if (input.score < 0 || input.score > q.score) {
      return { error: `점수는 0~${q.score} 범위여야 합니다.` };
    }
    finalScore = input.score;
  } else {
    return { error: '점수 또는 rubric_scores를 지정하세요.' };
  }

  const { data: existing } = await s
    .from('exam_responses')
    .select('id, answer_value')
    .eq('session_id', input.sessionId)
    .eq('question_id', input.questionId)
    .maybeSingle();

  // rubric 세부 점수는 answer_value.admin_rubric_scores에 원본 100점 기준으로 저장.
  // 응시자 flow는 이 필드 안 건드림 (saveAnswer가 task_based일 때 유지 로직 별도).
  const prevValue = (existing?.answer_value ?? {}) as Record<string, unknown>;
  const nextValue = scaledFromRubric
    ? { ...prevValue, admin_rubric_scores: input.rubric_scores }
    : prevValue;

  if (existing) {
    const patch: {
      manual_score: number;
      feedback: string | null;
      answer_value?: Json;
    } = {
      manual_score: finalScore,
      feedback: input.feedback ?? null
    };
    if (scaledFromRubric) patch.answer_value = nextValue as unknown as Json;
    const { error } = await s.from('exam_responses').update(patch).eq('id', existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await s.from('exam_responses').insert({
      session_id: input.sessionId,
      question_id: input.questionId,
      answer_value: scaledFromRubric ? (nextValue as unknown as Json) : null,
      manual_score: finalScore,
      feedback: input.feedback ?? null
    });
    if (error) return { error: error.message };
  }

  await recalculateSession(input.sessionId);
  revalidatePath(`/dashboard/exams/${input.examId}/sessions/${input.sessionId}`);
  revalidatePath(`/dashboard/exams/${input.examId}`);
  return {};
}
