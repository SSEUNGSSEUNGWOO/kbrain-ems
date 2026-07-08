'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';
import { isMultipleChoiceCorrect, isShortAnswerCorrect } from '@/lib/exam-grading';

type Answer = { key?: string; text?: string; file_path?: string; notes?: string; url?: string };
type SectionKind = 'multiple_choice' | 'short_text' | 'task_based';

// 작업형 파일 업로드 (Storage RLS 정책 없어도 admin client로 우회)
// 브라우저에서 anon key로 직접 업로드하면 정책 없이 실패하므로
// 서버 액션에서 admin으로 처리하고 클라이언트에 파일 정보만 반환.
const UPLOAD_BUCKET = 'exam-submissions';
const MAX_MB = 20;

export async function uploadTaskFile(
  token: string,
  formData: FormData
): Promise<{ error?: string; file?: { name: string; path: string; size: number; url: string } }> {
  try {
    const file = formData.get('file') as File | null;
    if (!file) return { error: '파일이 없습니다.' };
    if (file.size > MAX_MB * 1024 * 1024) return { error: `파일 크기가 ${MAX_MB}MB를 초과합니다.` };

    const s = createAdminClient();
    // 세션 검증 (제출 안 된 세션만 업로드 허용)
    const { data: session } = await s
      .from('exam_sessions')
      .select('id, submitted_at')
      .eq('token', token)
      .maybeSingle();
    if (!session) return { error: '세션이 없습니다.' };
    if (session.submitted_at) return { error: '이미 제출된 세션입니다.' };

    const safeName = file.name.replace(/[^\w.\-가-힣]/g, '_');
    const path = `${token}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const buf = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await s.storage.from(UPLOAD_BUCKET).upload(path, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
    if (upErr) return { error: `업로드 실패: ${upErr.message}` };

    const { data: signed } = await s.storage
      .from(UPLOAD_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    return {
      file: {
        name: file.name,
        path,
        size: file.size,
        url: signed?.signedUrl ?? ''
      }
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류' };
  }
}

export async function deleteTaskFile(token: string, path: string): Promise<{ error?: string }> {
  try {
    if (!path.startsWith(`${token}/`)) return { error: '경로가 잘못됐습니다.' };
    const s = createAdminClient();
    const { data: session } = await s
      .from('exam_sessions')
      .select('submitted_at')
      .eq('token', token)
      .maybeSingle();
    if (!session) return { error: '세션이 없습니다.' };
    if (session.submitted_at) return { error: '이미 제출된 세션입니다.' };
    const { error } = await s.storage.from(UPLOAD_BUCKET).remove([path]);
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : '삭제 실패' };
  }
}

const SECTION_ORDER: SectionKind[] = ['multiple_choice', 'short_text', 'task_based'];

type SectionState = {
  started_at?: string | null;
  submitted_at?: string | null;
};
type SectionProgress = Partial<Record<SectionKind, SectionState>>;

function nextSectionOf(kind: SectionKind): SectionKind | null {
  const idx = SECTION_ORDER.indexOf(kind);
  return idx >= 0 && idx < SECTION_ORDER.length - 1 ? SECTION_ORDER[idx + 1] : null;
}

// 첫 진입: 세션 시작 + 객관식 섹션 시작 (순차단방향)
export async function startSession(token: string): Promise<{ error?: string }> {
  const s = createAdminClient();
  const now = new Date().toISOString();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, started_at, submitted_at, section_progress')
    .eq('token', token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return { error: '이미 제출되었습니다.' };
  if (session.started_at) return {}; // 이미 시작

  const initialProgress: SectionProgress = {
    multiple_choice: { started_at: now, submitted_at: null },
    short_text: { started_at: null, submitted_at: null },
    task_based: { started_at: null, submitted_at: null }
  };

  const { error } = await s
    .from('exam_sessions')
    .update({
      started_at: now,
      section_progress: initialProgress as unknown as Json
    })
    .eq('id', session.id);
  if (error) return { error: error.message };
  return {};
}

// 응답 저장 — 순서 검증 없음. 섹션이 진행 중이어야 함.
export async function saveAnswer(input: {
  token: string;
  questionId: string;
  sectionKind: SectionKind;
  answer: Answer | null;
}): Promise<{ error?: string }> {
  const s = createAdminClient();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, submitted_at, section_progress, exam_id')
    .eq('token', input.token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return {};

  const sp = (session.section_progress ?? {}) as unknown as SectionProgress;
  const sect = sp[input.sectionKind];
  if (!sect?.started_at) return { error: '섹션이 시작되지 않았습니다.' };
  if (sect.submitted_at) return { error: '섹션이 이미 종료됐습니다.' };

  // 서버 시각 기준 섹션 시간 초과 검증 (클라 시계 조작 방어).
  // 유예 10초 — 마지막 1초에 답한 응답도 안전하게 받음.
  const { data: examRaw } = await s
    .from('exams')
    .select('time_limit_mc, time_limit_st, time_limit_task')
    .eq('id', session.exam_id)
    .maybeSingle();
  const exam = examRaw as unknown as {
    time_limit_mc: number | null;
    time_limit_st: number | null;
    time_limit_task: number | null;
  } | null;
  const limitSec =
    input.sectionKind === 'multiple_choice'
      ? exam?.time_limit_mc
      : input.sectionKind === 'short_text'
        ? exam?.time_limit_st
        : exam?.time_limit_task;
  if (limitSec && sect.started_at) {
    const elapsed = (Date.now() - new Date(sect.started_at).getTime()) / 1000;
    if (elapsed > limitSec + 10) {
      return { error: '섹션 시간이 만료되었습니다.' };
    }
  }

  const { error } = await s.from('exam_responses').upsert(
    {
      session_id: session.id,
      question_id: input.questionId,
      answer_value: (input.answer ?? null) as unknown as Json,
      submitted_at: new Date().toISOString()
    },
    { onConflict: 'session_id,question_id' }
  );
  if (error) return { error: error.message };
  return {};
}

// 검토 플래그 토글
export async function toggleFlag(input: {
  token: string;
  questionId: string;
}): Promise<{ error?: string; flagged?: boolean }> {
  const s = createAdminClient();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, submitted_at, flagged_question_ids')
    .eq('token', input.token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return {};

  const list = Array.isArray(session.flagged_question_ids)
    ? (session.flagged_question_ids as unknown as string[])
    : [];
  const has = list.includes(input.questionId);
  const next = has ? list.filter((x) => x !== input.questionId) : [...list, input.questionId];

  const { error } = await s
    .from('exam_sessions')
    .update({ flagged_question_ids: next as unknown as Json })
    .eq('id', session.id);
  if (error) return { error: error.message };
  return { flagged: !has };
}

// 섹션 종료 → 다음 섹션 자동 시작 (순차단방향). 마지막 섹션이면 종료만 처리.
export async function submitSection(input: {
  token: string;
  sectionKind: SectionKind;
  timeoutReached: boolean;
}): Promise<{ error?: string; nextSection?: SectionKind | null }> {
  const s = createAdminClient();
  const now = new Date().toISOString();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, submitted_at, section_progress')
    .eq('token', input.token)
    .maybeSingle();
  if (!session) return { error: '세션이 없습니다.' };
  if (session.submitted_at) return {};

  const sp = { ...((session.section_progress ?? {}) as unknown as SectionProgress) };
  const cur = sp[input.sectionKind];
  if (!cur?.started_at) return { error: '섹션이 시작되지 않았습니다.' };
  if (cur.submitted_at) {
    // 이미 종료됨 — 다음 섹션 알림
    return { nextSection: nextSectionOf(input.sectionKind) };
  }

  sp[input.sectionKind] = { ...cur, submitted_at: now };
  const nxt = nextSectionOf(input.sectionKind);
  if (nxt) sp[nxt] = { ...(sp[nxt] ?? {}), started_at: now, submitted_at: null };

  const { error } = await s
    .from('exam_sessions')
    .update({ section_progress: sp as unknown as Json })
    .eq('id', session.id);
  if (error) return { error: error.message };
  return { nextSection: nxt };
}

// 브라우저 이벤트 원자적 append
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

// 최종 제출 + 자동 채점 (객관식·단답)
export async function submitSession(token: string): Promise<{ error?: string }> {
  const s = createAdminClient();
  const now = new Date().toISOString();

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

  let autoScore = 0;
  let hasManual = false;
  for (const r of rows) {
    const q = r.exam_questions;
    if (!q) continue;
    const ans = r.answer_value;

    if (q.type === 'multiple_choice') {
      const correctKey = (q.correct as { key?: string } | null)?.key;
      const ansKey = (ans as { key?: string } | null)?.key;
      if (isMultipleChoiceCorrect(ansKey, correctKey)) autoScore += q.score;
    } else if (q.type === 'short_text') {
      const keywords = ((q.correct as { keywords?: string[] } | null)?.keywords ?? []);
      const text = (ans as { text?: string } | null)?.text ?? null;
      if (isShortAnswerCorrect(text, keywords)) autoScore += q.score;
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
