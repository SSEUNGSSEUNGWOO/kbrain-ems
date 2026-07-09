'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';

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
  score: number;
  feedback?: string | null;
}): Promise<{ error?: string }> {
  if (!(await isDeveloper())) return { error: '권한이 없습니다.' };

  const s = createAdminClient();

  const { data: q } = await s
    .from('exam_questions')
    .select('score')
    .eq('id', input.questionId)
    .maybeSingle();
  if (!q) return { error: '문항이 없습니다.' };
  if (input.score < 0 || input.score > q.score) {
    return { error: `점수는 0~${q.score} 범위여야 합니다.` };
  }

  const { data: existing } = await s
    .from('exam_responses')
    .select('id')
    .eq('session_id', input.sessionId)
    .eq('question_id', input.questionId)
    .maybeSingle();

  if (existing) {
    const { error } = await s
      .from('exam_responses')
      .update({ manual_score: input.score, feedback: input.feedback ?? null })
      .eq('id', existing.id);
    if (error) return { error: error.message };
  } else {
    // 응답이 아예 없는 경우 — 새 row 생성
    const { error } = await s.from('exam_responses').insert({
      session_id: input.sessionId,
      question_id: input.questionId,
      answer_value: null,
      manual_score: input.score,
      feedback: input.feedback ?? null
    });
    if (error) return { error: error.message };
  }

  await recalculateSession(input.sessionId);
  revalidatePath(`/dashboard/exams/${input.examId}/sessions/${input.sessionId}`);
  revalidatePath(`/dashboard/exams/${input.examId}`);
  return {};
}
