import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase/types';

export const ATTENDED_STATUSES = new Set(['present', 'late', 'early_leave']);
export const ABSENT_STATUSES = new Set(['absent', 'excused']);

// PostgREST 는 요청당 최대 1000행만 반환한다. 출결·체크인은 (학생 × 회차) 규모라
// 100명 기수부터 이 한도를 넘어 뒷부분이 조용히 잘린다 — 잘린 학생은 미출석으로
// 오판되므로 반드시 range() 로 전량 조회할 것.
const PAGE = 1000;
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const acc: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await page(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    acc.push(...data);
    if (data.length < PAGE) break;
  }
  return acc;
}

export type AttendanceCount = {
  attended: number;
  absent: number;
};

/**
 * 출결 판정 (union):
 * - attendance_records.status 가 출석 인정 상태(present/late/early_leave)면 인정 — 운영자 수동 입력 존중.
 * - 또는 회차에 attendance_checks 가 있고 학생이 **모든 체크포인트에 셀프 체크인**했으면 인정.
 *   (status 'none' 은 미기록 placeholder 이므로 출석으로 치지 않음)
 *
 * absentCount: 명시적으로 absent/excused 로 attendance_records 에 기록됐고 출석 인정도 안 된 회차만 결석으로 셈.
 *   체크포인트가 있고 학생이 체크 안 한 경우는 absent 로 자동 카운트하지 않음 (단순히 attended 미인정).
 */
export async function computeAttendanceCounts(
  supabase: SupabaseClient<Database>,
  cohortId: string,
  studentIds: string[]
): Promise<{ totalSessions: number; perStudent: Map<string, AttendanceCount> }> {
  const { data: sessionsRaw } = await supabase
    .from('sessions')
    .select('id')
    .eq('cohort_id', cohortId);
  const sessionIds = (sessionsRaw ?? []).map((s) => s.id);
  const totalSessions = sessionIds.length;

  const perStudent = new Map<string, AttendanceCount>();
  if (sessionIds.length === 0 || studentIds.length === 0) {
    for (const sid of studentIds) perStudent.set(sid, { attended: 0, absent: 0 });
    return { totalSessions, perStudent };
  }

  const [checksRes, attRecords, checkRecords] = await Promise.all([
    supabase
      .from('attendance_checks')
      .select('id, session_id')
      .in('session_id', sessionIds),
    fetchAllRows<{ student_id: string; session_id: string; status: string }>((from, to) =>
      supabase
        .from('attendance_records')
        .select('student_id, session_id, status')
        .in('session_id', sessionIds)
        .range(from, to)
    ),
    fetchAllRows<{ check_id: string; student_id: string }>((from, to) =>
      supabase
        .from('attendance_check_records')
        .select('check_id, student_id')
        .in('student_id', studentIds)
        .range(from, to)
    )
  ]);

  const checksBySession = new Map<string, string[]>();
  for (const c of checksRes.data ?? []) {
    const arr = checksBySession.get(c.session_id) ?? [];
    arr.push(c.id);
    checksBySession.set(c.session_id, arr);
  }

  const checkInsByStudent = new Map<string, Set<string>>();
  for (const r of checkRecords) {
    const set = checkInsByStudent.get(r.student_id) ?? new Set<string>();
    set.add(r.check_id);
    checkInsByStudent.set(r.student_id, set);
  }

  const attendanceStatusBy = new Map<string, string>();
  for (const a of attRecords) {
    attendanceStatusBy.set(`${a.student_id}__${a.session_id}`, a.status);
  }

  for (const sid of studentIds) {
    let attended = 0;
    let absent = 0;
    const checkIns = checkInsByStudent.get(sid) ?? new Set<string>();
    for (const sessionId of sessionIds) {
      const required = checksBySession.get(sessionId) ?? [];
      const status = attendanceStatusBy.get(`${sid}__${sessionId}`);
      const byStatus = !!status && ATTENDED_STATUSES.has(status);
      const byChecks =
        required.length > 0 && required.every((id) => checkIns.has(id));
      if (byStatus || byChecks) attended++;
      else if (status && ABSENT_STATUSES.has(status)) absent++;
    }
    perStudent.set(sid, { attended, absent });
  }

  return { totalSessions, perStudent };
}

/**
 * AI 챔피언 수료 판정.
 * 조건: OT 참석 + 집중교육 기간 내 3일 이상 참석 + 인증평가 참여(certification_results 존재)
 */
export type ChampionCompletion = {
  otAttended: boolean;
  intensiveDays: number;
  examParticipated: boolean;
  isCompleted: boolean;
};

export type ChampionCompletionResult = {
  otSessionCount: number;
  intensiveSessionCount: number;
  perStudent: Map<string, ChampionCompletion>;
};

const OT_TITLE_RE = /(OT|오리엔테이션)/i;

export async function computeChampionCompletion(
  supabase: SupabaseClient<Database>,
  cohortId: string,
  studentIds: string[],
  intensiveStart: string | null,
  intensiveEnd: string | null
): Promise<ChampionCompletionResult> {
  const { data: sessionsRaw } = await supabase
    .from('sessions')
    .select('id, title, session_date')
    .eq('cohort_id', cohortId);
  const sessions = sessionsRaw ?? [];

  const otSessionIds = new Set(
    sessions.filter((s) => s.title && OT_TITLE_RE.test(s.title)).map((s) => s.id)
  );
  const intensiveSessionIds = new Set(
    sessions
      .filter(
        (s) =>
          intensiveStart &&
          intensiveEnd &&
          s.session_date >= intensiveStart &&
          s.session_date <= intensiveEnd
      )
      .map((s) => s.id)
  );
  const relevantSessionIds = [...new Set([...otSessionIds, ...intensiveSessionIds])];

  const perStudent = new Map<string, ChampionCompletion>();
  if (studentIds.length === 0) {
    return {
      otSessionCount: otSessionIds.size,
      intensiveSessionCount: intensiveSessionIds.size,
      perStudent
    };
  }

  // 학생별 attended session id set 을 뽑기 위해 hybrid 로직 재사용
  const [checksRes, attRecords, checkRecords, certRes] = await Promise.all([
    relevantSessionIds.length > 0
      ? supabase
          .from('attendance_checks')
          .select('id, session_id')
          .in('session_id', relevantSessionIds)
      : Promise.resolve({ data: [] as { id: string; session_id: string }[] }),
    relevantSessionIds.length > 0
      ? fetchAllRows<{ student_id: string; session_id: string; status: string }>((from, to) =>
          supabase
            .from('attendance_records')
            .select('student_id, session_id, status')
            .in('session_id', relevantSessionIds)
            .range(from, to)
        )
      : Promise.resolve([] as { student_id: string; session_id: string; status: string }[]),
    fetchAllRows<{ check_id: string; student_id: string }>((from, to) =>
      supabase
        .from('attendance_check_records')
        .select('check_id, student_id')
        .in('student_id', studentIds)
        .range(from, to)
    ),
    (
      supabase.from(
        'certification_results' as unknown as 'cohorts'
      ) as unknown as {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string
          ) => PromiseLike<{
            data: { student_id: string | null }[] | null;
            error: { message: string } | null;
          }>;
        };
      }
    )
      .select('student_id')
      .eq('cohort_id', cohortId)
  ]);

  const checksBySession = new Map<string, string[]>();
  for (const c of checksRes.data ?? []) {
    const arr = checksBySession.get(c.session_id) ?? [];
    arr.push(c.id);
    checksBySession.set(c.session_id, arr);
  }
  const checkInsByStudent = new Map<string, Set<string>>();
  for (const r of checkRecords) {
    const set = checkInsByStudent.get(r.student_id) ?? new Set<string>();
    set.add(r.check_id);
    checkInsByStudent.set(r.student_id, set);
  }
  const attendanceStatusBy = new Map<string, string>();
  for (const a of attRecords) {
    attendanceStatusBy.set(`${a.student_id}__${a.session_id}`, a.status);
  }

  const participatedSet = new Set<string>();
  for (const r of certRes.data ?? []) {
    if (r.student_id) participatedSet.add(r.student_id);
  }

  const isAttended = (studentId: string, sessionId: string): boolean => {
    const status = attendanceStatusBy.get(`${studentId}__${sessionId}`);
    if (status && ATTENDED_STATUSES.has(status)) return true;
    const required = checksBySession.get(sessionId) ?? [];
    if (required.length > 0) {
      const checkIns = checkInsByStudent.get(studentId) ?? new Set<string>();
      return required.every((id) => checkIns.has(id));
    }
    return false;
  };

  for (const sid of studentIds) {
    const otAttended = [...otSessionIds].some((id) => isAttended(sid, id));
    let intensiveDays = 0;
    for (const id of intensiveSessionIds) if (isAttended(sid, id)) intensiveDays++;
    const examParticipated = participatedSet.has(sid);
    const isCompleted = otAttended && intensiveDays >= 3 && examParticipated;
    perStudent.set(sid, { otAttended, intensiveDays, examParticipated, isCompleted });
  }

  return {
    otSessionCount: otSessionIds.size,
    intensiveSessionCount: intensiveSessionIds.size,
    perStudent
  };
}
