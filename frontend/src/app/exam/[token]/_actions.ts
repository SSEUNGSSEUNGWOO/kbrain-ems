'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

type Answer = { key?: string; text?: string; file_path?: string; notes?: string; url?: string };

// 문항 응답 저장 + 다음 진행 (fire-and-forget 성격 — 클라이언트는 대기 안 함).
// 이전 클릭 시마다 5~8회 왕복하던 걸 upsert+update 병렬로 사실상 2회로 단축.
export async function saveAnswer(input: {
  token: string;
  currentOrder: number;
  questionId: string;
  answer: Answer | null;
  timeoutReached: boolean;
  isLast: boolean;
}): Promise<{ error?: string }> {
  const s = createAdminClient();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, submitted_at')
    .eq('token', input.token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return {}; // 이미 제출된 경우 silent

  const now = new Date().toISOString();

  const respPromise = s.from('exam_responses').upsert(
    {
      session_id: session.id,
      question_id: input.questionId,
      answer_value: (input.answer ?? null) as unknown as Json,
      submitted_at: now,
      feedback: input.timeoutReached ? '시간 초과로 자동 확정' : null
    },
    { onConflict: 'session_id,question_id' }
  );

  const sessPromise = input.isLast
    ? Promise.resolve({ error: null as Error | null })
    : s
        .from('exam_sessions')
        .update({ current_order_no: input.currentOrder + 1 })
        .eq('id', session.id);

  const [respRes] = await Promise.all([respPromise, sessPromise]);
  if (respRes.error) return { error: respRes.error.message };
  return {};
}

export async function startSession(token: string): Promise<{ error?: string }> {
  const s = createAdminClient();
  const now = new Date().toISOString();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, started_at, submitted_at')
    .eq('token', token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return { error: '이미 제출되었습니다.' };
  if (session.started_at) return {};

  const { error } = await s
    .from('exam_sessions')
    .update({ started_at: now, current_order_no: 1 })
    .eq('id', session.id);
  if (error) return { error: error.message };
  return {};
}

// fire-and-forget: 세션 조회 + append + update. 응답 안 기다림.
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
  const existing = Array.isArray(session.browser_events)
    ? (session.browser_events as unknown as { event: string; at: string }[])
    : [];
  existing.push({ event: input.event, at: input.at });
  await s
    .from('exam_sessions')
    .update({ browser_events: existing as unknown as Json })
    .eq('id', session.id);
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
  if (session.submitted_at) return {};

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

  const updatePromises: Promise<unknown>[] = [];
  for (const r of responses ?? []) {
    const q = qMap.get(r.question_id);
    if (!q) continue;
    const ans = r.answer_value as Record<string, unknown> | null;
    let earned = 0;

    if (q.type === 'multiple_choice') {
      const correctKey = (q.correct as { key?: string } | null)?.key;
      if (correctKey && ans && (ans as { key?: string }).key === correctKey) {
        earned = q.score;
      }
    } else if (q.type === 'short_text') {
      const keywords = (
        (q.correct as { keywords?: string[] } | null)?.keywords ?? []
      ).map((k) => k.trim().toLowerCase());
      const submitted = String((ans as { text?: string } | null)?.text ?? '')
        .trim()
        .toLowerCase();
      if (submitted && keywords.some((k) => submitted === k)) {
        earned = q.score;
      }
    } else if (q.type === 'task_based') {
      hasManual = true;
    }

    if (q.type !== 'task_based') {
      updatePromises.push(
        s.from('exam_responses').update({ auto_score: earned }).eq('id', r.id)
      );
      autoScore += earned;
    }
  }
  await Promise.all(updatePromises);

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
