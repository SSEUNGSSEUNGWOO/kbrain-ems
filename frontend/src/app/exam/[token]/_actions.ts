'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

type Answer = { key?: string; text?: string; file_path?: string; notes?: string; url?: string };

// 문항 응답 저장 + 다음 진행. 순서 검증(CAS)으로 부정 조작·중복 요청 방어.
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
    .select('id, submitted_at, current_order_no')
    .eq('token', input.token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return {}; // 이미 제출된 경우 silent

  // CAS 검증: 클라이언트가 주장한 order와 서버 order 일치해야만 다음으로 진행
  if (session.current_order_no !== input.currentOrder) {
    return { error: '문항 순서가 어긋났습니다. 새로고침 후 다시 시도하세요.' };
  }

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

  // 순서 갱신은 CAS: 다른 요청이 이미 갱신했으면 데이터 반환 없음 → 무시
  const sessPromise = input.isLast
    ? Promise.resolve({ error: null as Error | null })
    : s
        .from('exam_sessions')
        .update({ current_order_no: input.currentOrder + 1 })
        .eq('id', session.id)
        .eq('current_order_no', input.currentOrder);

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

// 원자적 append — pg 함수(append_exam_browser_event)로 race condition 없이 처리.
// 이전: 조회→push→update 3단계에서 동시 이벤트 손실. 이제 UPDATE 한 문장.
export async function logBrowserEvent(input: {
  token: string;
  event: string;
  at: string;
  durationMs?: number;
}): Promise<void> {
  const s = createAdminClient();
  const { data: session } = await s
    .from('exam_sessions')
    .select('id')
    .eq('token', input.token)
    .maybeSingle();
  if (!session) return;
  const entry: { event: string; at: string; duration_ms?: number } = {
    event: input.event,
    at: input.at
  };
  if (input.durationMs != null) entry.duration_ms = input.durationMs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (s as any).rpc('append_exam_browser_event', {
    sess_id: session.id,
    event_data: entry
  });
}

// 자동 채점: 객관식·단답만. task_based는 manual.
export async function submitSession(token: string): Promise<{ error?: string }> {
  const s = createAdminClient();
  const now = new Date().toISOString();

  // 응답+문항+세션을 한 쿼리로 조인 → in-memory 채점 → 세션 update 1회
  const { data: joined } = await s
    .from('exam_responses')
    .select(
      'id, question_id, answer_value, exam_questions(id, type, score, correct), exam_sessions!inner(id, token, submitted_at)'
    )
    .eq('exam_sessions.token', token);

  type Joined = {
    id: string;
    question_id: string;
    answer_value: Record<string, unknown> | null;
    exam_questions: { id: string; type: string; score: number; correct: unknown } | null;
    exam_sessions: { id: string; token: string | null; submitted_at: string | null };
  };
  const rows = (joined ?? []) as unknown as Joined[];

  let sessionId: string | null = rows[0]?.exam_sessions.id ?? null;
  if (!sessionId) {
    const { data: sess } = await s
      .from('exam_sessions')
      .select('id, submitted_at')
      .eq('token', token)
      .maybeSingle();
    if (!sess) return { error: '세션이 없습니다.' };
    if (sess.submitted_at) return {};
    sessionId = sess.id;
  } else if (rows[0]?.exam_sessions.submitted_at) {
    return {};
  }

  const responses = rows.map((r) => ({ question_id: r.question_id, answer_value: r.answer_value }));
  const qMap = new Map(rows.filter((r) => r.exam_questions).map((r) => [r.exam_questions!.id, r.exam_questions!]));
  let autoScore = 0;
  let hasManual = false;

  for (const r of responses ?? []) {
    const q = qMap.get(r.question_id);
    if (!q) continue;
    const ans = r.answer_value as Record<string, unknown> | null;

    if (q.type === 'multiple_choice') {
      const correctKey = (q.correct as { key?: string } | null)?.key;
      if (correctKey && ans && (ans as { key?: string }).key === correctKey) {
        autoScore += q.score;
      }
    } else if (q.type === 'short_text') {
      const keywords = (
        (q.correct as { keywords?: string[] } | null)?.keywords ?? []
      ).map((k) => k.trim().toLowerCase());
      const submitted = String((ans as { text?: string } | null)?.text ?? '')
        .trim()
        .toLowerCase();
      if (submitted && keywords.some((k) => submitted === k)) {
        autoScore += q.score;
      }
    } else if (q.type === 'task_based') {
      hasManual = true;
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
    .eq('id', sessionId);
  if (error) return { error: error.message };
  return {};
}
