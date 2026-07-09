'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';
import { isMultipleChoiceCorrect, isShortAnswerCorrect } from '@/lib/exam-grading';

type Answer = { key?: string; text?: string; file_path?: string; notes?: string; url?: string };
type SectionKind = 'multiple_choice' | 'short_text' | 'task_based';

type SectionCheck =
  | { ok: true; sessionId: string }
  | { ok: false; error: string; code: 'no_session' | 'submitted' | 'not_started' | 'expired' };

// 모든 write 진입점의 공통 검증 — 세션 존재·미제출·섹션 진행 중·시간 안 지남.
// grace 0초. 클라이언트는 이미 만료 예상 시점에 요청을 보내지 않도록 자체 억제.
async function assertSectionAlive(
  s: ReturnType<typeof createAdminClient>,
  token: string,
  sectionKind: SectionKind
): Promise<SectionCheck> {
  const { data: session } = await s
    .from('exam_sessions')
    .select('id, exam_id, submitted_at, section_progress')
    .eq('token', token)
    .maybeSingle();
  if (!session) return { ok: false, code: 'no_session', error: '세션이 없습니다.' };
  if (session.submitted_at)
    return { ok: false, code: 'submitted', error: '이미 제출된 세션입니다.' };

  const sp = (session.section_progress ?? {}) as unknown as SectionProgress;
  const sect = sp[sectionKind];
  if (!sect?.started_at)
    return { ok: false, code: 'not_started', error: '섹션이 시작되지 않았습니다.' };
  if (sect.submitted_at)
    return { ok: false, code: 'expired', error: '섹션이 이미 종료됐습니다.' };

  // supabase types.ts에 time_limit_* 컬럼이 아직 반영 안 되어있어 타입 우회.
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
    sectionKind === 'multiple_choice'
      ? exam?.time_limit_mc
      : sectionKind === 'short_text'
        ? exam?.time_limit_st
        : exam?.time_limit_task;
  if (limitSec) {
    const elapsed = (Date.now() - new Date(sect.started_at).getTime()) / 1000;
    // grace 0초 hard-cut. 경계 시점(정확히 limitSec초 경과)에도 저장 거부.
    if (elapsed >= limitSec)
      return { ok: false, code: 'expired', error: '섹션 시간이 만료되었습니다.' };
  }
  return { ok: true, sessionId: session.id };
}

// 작업형 파일 업로드 (Storage RLS 정책 없어도 admin client로 우회)
// 브라우저에서 anon key로 직접 업로드하면 정책 없이 실패하므로
// 서버 액션에서 admin으로 처리하고 클라이언트에 파일 정보만 반환.
const UPLOAD_BUCKET = 'exam-submissions';
const MAX_MB = 20;

type ExpiryCode = 'no_session' | 'submitted' | 'not_started' | 'expired';

type TaskFile = { name: string; path: string; size: number; url: string };

function buildTaskFilePath(token: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot).replace(/[^\w.]/g, '').slice(0, 10) : '';
  return `${token}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
}

// Vercel Function 본문 제한을 피하기 위한 2단계 업로드.
// 서버 액션은 권한·시간 검증 후 Supabase signed upload token만 발급하고,
// 실제 파일 바이트는 브라우저가 Supabase Storage로 직접 전송한다.
export async function prepareTaskFileUpload(input: {
  token: string;
  questionId: string;
  fileName: string;
  fileSize: number;
}): Promise<{ error?: string; code?: ExpiryCode; path?: string; signedUrl?: string }> {
  try {
    if (!input.questionId) return { error: '문항 정보가 없습니다.' };
    if (!input.fileName) return { error: '파일명이 없습니다.' };
    if (input.fileSize > MAX_MB * 1024 * 1024) return { error: `파일 크기가 ${MAX_MB}MB를 초과합니다.` };

    const s = createAdminClient();
    const check = await assertSectionAlive(s, input.token, 'task_based');
    if (!check.ok) return { error: check.error, code: check.code };

    const path = buildTaskFilePath(input.token, input.fileName);
    const { data, error } = await s.storage.from(UPLOAD_BUCKET).createSignedUploadUrl(path);
    if (error || !data?.signedUrl) {
      return { error: `업로드 준비 실패: ${error?.message ?? 'signed token 없음'}` };
    }
    return { path, signedUrl: data.signedUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '업로드 준비 실패' };
  }
}

export async function completeTaskFileUpload(input: {
  token: string;
  questionId: string;
  file: { name: string; path: string; size: number };
}): Promise<{ error?: string; files?: TaskFile[] }> {
  try {
    if (!input.file.path.startsWith(`${input.token}/`)) return { error: '경로가 잘못됐습니다.' };

    const s = createAdminClient();
    const { data: session } = await s
      .from('exam_sessions')
      .select('id, submitted_at')
      .eq('token', input.token)
      .maybeSingle();
    if (!session) return { error: '세션이 없습니다.' };

    const { data: signed } = await s.storage
      .from(UPLOAD_BUCKET)
      .createSignedUrl(input.file.path, 60 * 60 * 24 * 365);

    const newFile: TaskFile = {
      name: input.file.name,
      path: input.file.path,
      size: input.file.size,
      url: signed?.signedUrl ?? ''
    };

    const { data: mergedFiles, error: dbErr } = await (s.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)('append_task_file', {
      p_session_id: session.id,
      p_question_id: input.questionId,
      p_new_file: newFile as unknown as Json
    });
    if (dbErr) return { error: `저장 실패: ${dbErr.message}` };

    return { files: (mergedFiles as unknown as TaskFile[]) ?? [newFile] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '업로드 완료 처리 실패' };
  }
}

// 원자적 파일 append.
// 이전 방식(Storage 업로드 후 클라이언트가 saveAnswer로 files 배열을 별도 저장)은
// 두 요청 사이 실패 시 Storage-DB 불일치 발생 → 실제 시험에서 "5개 올렸는데 2개만 저장" 사고 원인.
// 해결: 서버에서 Storage 업로드 + answer_value.files JSONB append를 한 요청으로 처리 (원자성).
// upsert 대신 select→merge→update로 concurrent 업로드 시 마지막 것이 이전 파일 덮어쓰는 문제도 방지.
export async function uploadTaskFile(
  token: string,
  formData: FormData
): Promise<{
  error?: string;
  code?: ExpiryCode;
  files?: TaskFile[]; // 전체 파일 목록 (append 후) — 클라이언트는 이걸로 상태 통째 교체
}> {
  try {
    const file = formData.get('file') as File | null;
    const questionId = formData.get('questionId') as string | null;
    if (!file) return { error: '파일이 없습니다.' };
    if (!questionId) return { error: '문항 정보가 없습니다.' };
    if (file.size > MAX_MB * 1024 * 1024) return { error: `파일 크기가 ${MAX_MB}MB를 초과합니다.` };

    const s = createAdminClient();
    // 세션 + 작업형 섹션 진행 중 + 시간 안 지남 검증
    const check = await assertSectionAlive(s, token, 'task_based');
    if (!check.ok) return { error: check.error, code: check.code };

    // Storage 경로는 완전 안전한 문자로만 (한글·특수문자 있으면 Invalid key 에러).
    // 원본 파일명은 응답에 담아서 관리자 xlsx에 표시하고, path는 timestamp+random+확장자만.
    const path = buildTaskFilePath(token, file.name);
    const buf = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await s.storage.from(UPLOAD_BUCKET).upload(path, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
    if (upErr) return { error: `업로드 실패: ${upErr.message}` };

    const { data: signed } = await s.storage
      .from(UPLOAD_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    const newFile: TaskFile = {
      name: file.name,
      path,
      size: file.size,
      url: signed?.signedUrl ?? ''
    };

    // DB append — Postgres RPC로 원자적 처리. jsonb || 연산자를 UPDATE 안에서 사용해
    // concurrent 요청이 서로 덮어쓰지 않음 → 클라이언트가 병렬 업로드해도 파일 유실 없음.
    const { data: mergedFiles, error: dbErr } = await (s.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)('append_task_file', {
      p_session_id: check.sessionId,
      p_question_id: questionId,
      p_new_file: newFile as unknown as Json
    });
    if (dbErr) {
      // DB 저장 실패 → Storage 파일도 롤백해서 orphan 방지
      await s.storage.from(UPLOAD_BUCKET).remove([path]).catch(() => {});
      return { error: `저장 실패: ${dbErr.message}` };
    }

    return { files: (mergedFiles as unknown as TaskFile[]) ?? [newFile] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류' };
  }
}

// 파일 삭제도 원자적으로 — Storage 제거 + answer_value.files에서 해당 path 제거.
export async function deleteTaskFile(
  token: string,
  questionId: string,
  path: string
): Promise<{ error?: string; code?: ExpiryCode; files?: TaskFile[] }> {
  try {
    if (!path.startsWith(`${token}/`)) return { error: '경로가 잘못됐습니다.' };
    const s = createAdminClient();
    const check = await assertSectionAlive(s, token, 'task_based');
    if (!check.ok) return { error: check.error, code: check.code };

    // Postgres RPC로 원자적 제거 (concurrent 안전)
    const { data: nextFiles, error: dbErr } = await (s.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)('remove_task_file', {
      p_session_id: check.sessionId,
      p_question_id: questionId,
      p_path: path
    });
    if (dbErr) return { error: dbErr.message };

    // Storage 제거 — 실패해도 UI는 성공 처리 (DB에 반영됐으므로 관리자에게 안 보임)
    await s.storage.from(UPLOAD_BUCKET).remove([path]).catch(() => {});
    return { files: (nextFiles as unknown as TaskFile[]) ?? [] };
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
}): Promise<{ error?: string; code?: ExpiryCode }> {
  const s = createAdminClient();

  // 세션 + 섹션 진행 중 + 시간 안 지남 (hard cut, grace 0초)
  const check = await assertSectionAlive(s, input.token, input.sectionKind);
  if (!check.ok) {
    // 이미 최종 제출된 경우는 조용히 성공 처리 (재제출 UI 중복 방지)
    if (check.code === 'submitted') return {};
    return { error: check.error, code: check.code };
  }

  // task_based: notes/url만 원자적 partial update (files·admin_rubric_scores 안 건드림).
  // 이전엔 read-merge-upsert 방식이라 uploadTaskFile과 겹치면 files 유실 위험.
  // update_task_meta RPC로 jsonb_set 파티셔닝 update → race 없음.
  if (input.sectionKind === 'task_based') {
    const ans = (input.answer ?? {}) as { notes?: string; url?: string };
    const { error } = await (
      s.rpc as unknown as (
        name: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )('update_task_meta', {
      p_session_id: check.sessionId,
      p_question_id: input.questionId,
      p_notes: ans.notes ?? '',
      p_url: ans.url ?? ''
    });
    if (error) return { error: error.message };
    return {};
  }

  // 객관식·단답형: 응답 값 통째 upsert (files 필드 없음)
  const { error } = await s.from('exam_responses').upsert(
    {
      session_id: check.sessionId,
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

  // 마지막 섹션이면 이 요청에서 자동채점까지 함께 처리 (서버 왕복 2회 → 1회로 단축)
  if (!nxt) {
    // 응답 조회 + 채점
    const { data: joined } = await s
      .from('exam_responses')
      .select('question_id, answer_value, exam_questions(id, type, score, correct)')
      .eq('session_id', session.id);
    type Joined = {
      question_id: string;
      answer_value: Record<string, unknown> | null;
      exam_questions: { id: string; type: string; score: number; correct: unknown } | null;
    };
    let autoScore = 0;
    let hasManual = false;
    // 개별 문항 채점 시 예외가 나도 다른 문항 계속 진행. 응시자 총점이 부분 유실되는 사고 방지.
    // (answer_value / q.correct가 seed 실수로 예상 밖 형식이어도 여기서 죽지 않게)
    for (const r of (joined ?? []) as unknown as Joined[]) {
      const q = r.exam_questions;
      if (!q) continue;
      try {
        const ans = r.answer_value;
        if (q.type === 'multiple_choice') {
          const ansKey = (ans as { key?: string } | null)?.key;
          const correctKey = (q.correct as { key?: string } | null)?.key;
          if (isMultipleChoiceCorrect(ansKey, correctKey)) autoScore += q.score;
        } else if (q.type === 'short_text') {
          const text = (ans as { text?: string } | null)?.text ?? null;
          const keywords = ((q.correct as { keywords?: string[] } | null)?.keywords ?? []);
          if (isShortAnswerCorrect(text, keywords)) autoScore += q.score;
        } else if (q.type === 'task_based') {
          hasManual = true;
        }
      } catch {
        // 개별 문항 예외는 무시 — 오답 처리하고 다음 문항 계속
      }
    }
    const { error } = await s
      .from('exam_sessions')
      .update({
        section_progress: sp as unknown as Json,
        submitted_at: now,
        auto_score: autoScore,
        // status는 응시자 최종 제출 시점부터 '제출완료'로 통일 (자동채점 여부는 total_score로 구분).
        status: 'submitted',
        total_score: hasManual ? null : autoScore
      })
      .eq('id', session.id);
    if (error) return { error: error.message };
    return { nextSection: null };
  }

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
  // 문항별 try-catch — 예상 밖 answer_value/q.correct 형식이 있어도 나머지 문항은 그대로 채점.
  for (const r of rows) {
    const q = r.exam_questions;
    if (!q) continue;
    try {
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
    } catch {
      // 개별 문항 예외는 무시
    }
  }

  const { error } = await s
    .from('exam_sessions')
    .update({
      submitted_at: now,
      auto_score: autoScore,
      status: 'submitted',
      total_score: hasManual ? null : autoScore
    })
    .eq('id', sessionId);
  if (error) return { error: error.message };
  return {};
}
