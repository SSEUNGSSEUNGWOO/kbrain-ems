import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase/types';

export const ATTENDED_STATUSES = new Set(['present', 'late', 'early_leave']);
export const ABSENT_STATUSES = new Set(['absent', 'excused']);

export type AttendanceCount = {
  attended: number;
  absent: number;
};

/**
 * 출결 판정 (hybrid):
 * - 회차에 attendance_checks 가 있으면: 학생이 그 회차의 **모든 체크포인트에 셀프 체크인**해야 출석 인정.
 *   일부만 체크하고 빠진 게 있으면 출석 미인정. (운영자 수동 입력보다 셀프 체크인 데이터를 신뢰)
 * - 회차에 attendance_checks 가 없으면: attendance_records.status 가 출석 인정 상태(present/late/early_leave)면 인정.
 *
 * absentCount: 명시적으로 absent/excused 로 attendance_records 에 기록된 회차만 결석으로 셈.
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

  const [checksRes, attRecordsRes, checkRecordsRes] = await Promise.all([
    supabase
      .from('attendance_checks')
      .select('id, session_id')
      .in('session_id', sessionIds),
    supabase
      .from('attendance_records')
      .select('student_id, session_id, status')
      .in('session_id', sessionIds),
    supabase
      .from('attendance_check_records')
      .select('check_id, student_id')
      .in('student_id', studentIds)
  ]);

  const checksBySession = new Map<string, string[]>();
  for (const c of checksRes.data ?? []) {
    const arr = checksBySession.get(c.session_id) ?? [];
    arr.push(c.id);
    checksBySession.set(c.session_id, arr);
  }

  const checkInsByStudent = new Map<string, Set<string>>();
  for (const r of checkRecordsRes.data ?? []) {
    const set = checkInsByStudent.get(r.student_id) ?? new Set<string>();
    set.add(r.check_id);
    checkInsByStudent.set(r.student_id, set);
  }

  const attendanceStatusBy = new Map<string, string>();
  for (const a of attRecordsRes.data ?? []) {
    attendanceStatusBy.set(`${a.student_id}__${a.session_id}`, a.status);
  }

  for (const sid of studentIds) {
    let attended = 0;
    let absent = 0;
    const checkIns = checkInsByStudent.get(sid) ?? new Set<string>();
    for (const sessionId of sessionIds) {
      const required = checksBySession.get(sessionId) ?? [];
      const status = attendanceStatusBy.get(`${sid}__${sessionId}`);
      if (required.length > 0) {
        const allChecked = required.every((id) => checkIns.has(id));
        if (allChecked) attended++;
        else if (status && ABSENT_STATUSES.has(status)) absent++;
      } else {
        if (status && ATTENDED_STATUSES.has(status)) attended++;
        else if (status && ABSENT_STATUSES.has(status)) absent++;
      }
    }
    perStudent.set(sid, { attended, absent });
  }

  return { totalSessions, perStudent };
}
