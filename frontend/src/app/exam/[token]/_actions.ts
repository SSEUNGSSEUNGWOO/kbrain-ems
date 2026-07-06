'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';

type StringAnswer = { key?: string; text?: string; file_path?: string; notes?: string; url?: string };

// 개별 문항 응답 저장 + 다음 문항으로 진행.
// 순차 CBT — order_no 앞뒤 검증. 이미 지난 문항은 잠금.
export async function advanceQuestion(input: {
  token: string;
  questionOrder: number;
  answer: StringAnswer | null;
  timeoutReached: boolean;
}): Promise<{ error?: string; nextOrder?: number | 'done' }> {
  const { token, questionOrder, answer, timeoutReached } = input;
  const s = createAdminClient();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, exam_id, started_at, submitted_at, current_order_no')
    .eq('token', token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return { error: '이미 제출되었습니다.' };
  if (!session.started_at) return { error: '시험을 아직 시작하지 않았습니다.' };

  // 순차 검증: 클라이언트가 주장한 문항이 현재 세션이 있는 문항과 일치해야 함
  if (session.current_order_no !== questionOrder) {
    return { error: '문항 순서가 어긋났습니다. 새로고침 후 다시 시도하세요.' };
  }

  const { data: qie } = await s
    .from('exam_questions_in_exam')
    .select('question_id, order_no')
    .eq('exam_id', session.exam_id)
    .order('order_no');
  if (!qie || qie.length === 0) return { error: '문항이 없습니다.' };

  const currentEntry = qie.find((r) => r.order_no === questionOrder);
  if (!currentEntry) return { error: '문항을 찾을 수 없습니다.' };

  // 응답 upsert
  const { error: upErr } = await s.from('exam_responses').upsert(
    {
      session_id: session.id,
      question_id: currentEntry.question_id,
      answer_value: answer as unknown as Record<string, unknown>,
      submitted_at: new Date().toISOString(),
      feedback: timeoutReached ? '시간 초과로 자동 확정' : null
    },
    { onConflict: 'session_id,question_id' }
  );
  if (upErr) return { error: upErr.message };

  // 다음 문항으로 진행 또는 종료
  const nextEntry = qie.find((r) => r.order_no === questionOrder + 1);
  if (!nextEntry) {
    // 마지막 문항 응답 후: 아직 자동 제출 안 함 — 클라이언트에서 명시적으로 제출
    return { nextOrder: 'done' };
  }

  // 다음 문항 진입 처리: current_order_no 갱신 + 응답 row 준비 (visited_at)
  await s
    .from('exam_sessions')
    .update({ current_order_no: nextEntry.order_no })
    .eq('id', session.id);

  await s.from('exam_responses').upsert(
    {
      session_id: session.id,
      question_id: nextEntry.question_id,
      visited_at: new Date().toISOString(),
      answer_value: null
    },
    { onConflict: 'session_id,question_id' }
  );

  return { nextOrder: nextEntry.order_no };
}

export async function startSession(token: string): Promise<{ error?: string }> {
  const s = createAdminClient();
  const now = new Date().toISOString();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, exam_id, started_at, submitted_at')
    .eq('token', token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return { error: '이미 제출되었습니다.' };
  if (session.started_at) return {}; // 이미 시작

  const { data: firstQ } = await s
    .from('exam_questions_in_exam')
    .select('question_id, order_no')
    .eq('exam_id', session.exam_id)
    .order('order_no')
    .limit(1)
    .maybeSingle();
  if (!firstQ) return { error: '문항이 없습니다.' };

  const { error } = await s
    .from('exam_sessions')
    .update({
      started_at: now,
      current_order_no: firstQ.order_no
    })
    .eq('id', session.id);
  if (error) return { error: error.message };

  await s.from('exam_responses').upsert(
    {
      session_id: session.id,
      question_id: firstQ.question_id,
      visited_at: now,
      answer_value: null
    },
    { onConflict: 'session_id,question_id' }
  );

  revalidatePath(`/exam/${token}`);
  return {};
}

export async function logBrowserEvent(input: {
  token: string;
  event: string;
  at: string;
}): Promise<void> {
  const s = createAdminClient();
  const { data: session } = await s
    .from('exam_sessions')
    .select('id, browser_events')
    .eq('token', input.token)
    .maybeSingle();
  if (!session) return;
  const events = Array.isArray(session.browser_events) ? session.browser_events : [];
  events.push({ event: input.event, at: input.at });
  await s.from('exam_sessions').update({ browser_events: events }).eq('id', session.id);
}

// 자동 채점: 객관식·단답만. task_based는 manual.
export async function submitSession(token: string): Promise<{ error?: string }> {
  const s = createAdminClient();
  const now = new Date().toISOString();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, exam_id, submitted_at')
    .eq('token', token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return {}; // 이미 제출

  const { data: responses } = await s
    .from('exam_responses')
    .select('id, question_id, answer_value')
    .eq('session_id', session.id);

  const qIds = (responses ?? []).map((r) => r.question_id);
  const { data: questions } = await s
    .from('exam_questions')
    .select('id, type, score, correct')
    .in('id', qIds.length > 0 ? qIds : ['00000000-0000-0000-0000-000000000000']);

  const qMap = new Map((questions ?? []).map((q) => [q.id, q]));
  let autoScore = 0;
  let hasManual = false;

  for (const r of responses ?? []) {
    const q = qMap.get(r.question_id);
    if (!q) continue;
    const ans = r.answer_value as Record<string, unknown> | null;
    let earned = 0;

    if (q.type === 'multiple_choice') {
      const correctKey = (q.correct as { key?: string })?.key;
      if (correctKey && ans && (ans as { key?: string }).key === correctKey) {
        earned = q.score;
      }
    } else if (q.type === 'short_text') {
      const keywords = ((q.correct as { keywords?: string[] })?.keywords ?? []).map((k) =>
        k.trim().toLowerCase()
      );
      const submitted = String((ans as { text?: string })?.text ?? '')
        .trim()
        .toLowerCase();
      if (submitted && keywords.some((k) => submitted === k)) {
        earned = q.score;
      }
    } else if (q.type === 'task_based') {
      hasManual = true;
      // 자동 채점 없음 — manual_score는 채점자 수동 입력
    }

    if (q.type !== 'task_based') {
      await s.from('exam_responses').update({ auto_score: earned }).eq('id', r.id);
      autoScore += earned;
    }
  }

  const { error } = await s
    .from('exam_sessions')
    .update({
      submitted_at: now,
      auto_score: autoScore,
      status: hasManual ? 'submitted' : 'graded',
      total_score: hasManual ? null : autoScore
    })
    .eq('id', session.id);
  if (error) return { error: error.message };

  return {};
}
