'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { inferAttendanceRole } from '@/lib/attendance';
import { revalidatePath } from 'next/cache';

type AttendanceRecord = {
  student_id: string;
  status: string;
  note: string | null;
  arrival_time: string | null;
  departure_time: string | null;
  credited_hours: number | null;
};

type ActionResult = { error?: string };

export async function saveAttendance(
  sessionId: string,
  cohortId: string,
  records: AttendanceRecord[],
  deleteStudentIds: string[] = []
): Promise<ActionResult> {
  const supabase = createAdminClient();

  // 시간 컬럼은 해당 상태일 때만 포함 — 지각/조퇴가 아닌 학생의 QR 도착·퇴장
  // 시각을 null 로 덮어쓰지 않기 위해 upsert 에서 컬럼 자체를 뺀다.
  // (PostgREST 일괄 upsert 는 row 간 컬럼이 같아야 하므로 그룹별로 나눠 호출)
  const base = (r: AttendanceRecord) => ({
    session_id: sessionId,
    student_id: r.student_id,
    status: r.status,
    note: r.note,
    credited_hours: r.credited_hours?.toString() ?? null
  });
  const lateRows = records
    .filter((r) => r.status === 'late')
    .map((r) => ({ ...base(r), arrival_time: r.arrival_time }));
  const earlyLeaveRows = records
    .filter((r) => r.status === 'early_leave')
    .map((r) => ({ ...base(r), departure_time: r.departure_time }));
  const plainRows = records
    .filter((r) => r.status !== 'late' && r.status !== 'early_leave')
    .map(base);

  for (const rows of [plainRows, lateRows, earlyLeaveRows]) {
    if (rows.length === 0) continue;
    const { error } = await supabase
      .from('attendance_records')
      .upsert(rows, { onConflict: 'session_id,student_id' });
    if (error) return { error: error.message };
  }

  // 출결을 '-'(미기록)로 되돌린 학생은 row 삭제 — 안 지우면 새로고침 때 되살아난다.
  if (deleteStudentIds.length > 0) {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('session_id', sessionId)
      .in('student_id', deleteStudentIds);
    if (error) return { error: error.message };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance/${sessionId}`);
  return {};
}

function shortToken(len = 8): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

export async function createAttendanceCheck(
  sessionId: string,
  cohortId: string,
  label: string,
  opensAt: string | null,
  closesAt: string | null,
  attendanceRole: 'arrival' | 'departure' | null,
  criterionAt: string | null
): Promise<{ error?: string; id?: string }> {
  if (!label.trim()) return { error: '체크포인트 이름을 입력해주세요.' };
  if (opensAt && closesAt && new Date(opensAt) >= new Date(closesAt)) {
    return { error: '종료 시각이 시작 시각보다 빠릅니다.' };
  }
  const supabase = createAdminClient();

  // 마지막 display_order + 1
  const { data: existing } = await supabase
    .from('attendance_checks')
    .select('display_order')
    .eq('session_id', sessionId)
    .order('display_order', { ascending: false })
    .limit(1);
  const nextOrder = ((existing?.[0]?.display_order as number | undefined) ?? 0) + 1;

  // role 명시되지 않으면 label로 추론 ("입실/출석" → arrival, "퇴실" → departure)
  const effectiveRole = attendanceRole ?? inferAttendanceRole(label);

  const { data, error } = await supabase
    .from('attendance_checks')
    .insert({
      session_id: sessionId,
      label: label.trim(),
      share_code: shortToken(),
      display_order: nextOrder,
      opens_at: opensAt,
      closes_at: closesAt,
      attendance_role: effectiveRole,
      criterion_at: criterionAt
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance/${sessionId}`);
  return { id: data.id };
}

export async function updateAttendanceCheck(
  checkId: string,
  cohortId: string,
  sessionId: string,
  patch: {
    label?: string;
    opens_at?: string | null;
    closes_at?: string | null;
    attendance_role?: 'arrival' | 'departure' | null;
    criterion_at?: string | null;
  }
): Promise<{ error?: string }> {
  if (patch.label !== undefined && !patch.label.trim()) {
    return { error: '체크포인트 이름을 비울 수 없습니다.' };
  }
  if (patch.opens_at && patch.closes_at && new Date(patch.opens_at) >= new Date(patch.closes_at)) {
    return { error: '종료 시각이 시작 시각보다 빠릅니다.' };
  }
  const supabase = createAdminClient();
  const update: {
    label?: string;
    opens_at?: string | null;
    closes_at?: string | null;
    attendance_role?: 'arrival' | 'departure' | null;
    criterion_at?: string | null;
  } = {};
  if (patch.label !== undefined) update.label = patch.label.trim();
  if (patch.opens_at !== undefined) update.opens_at = patch.opens_at;
  if (patch.closes_at !== undefined) update.closes_at = patch.closes_at;
  if (patch.attendance_role !== undefined) update.attendance_role = patch.attendance_role;
  if (patch.criterion_at !== undefined) update.criterion_at = patch.criterion_at;

  const { error } = await supabase
    .from('attendance_checks')
    .update(update)
    .eq('id', checkId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance/${sessionId}`);
  return {};
}

export async function deleteAttendanceCheck(
  checkId: string,
  cohortId: string,
  sessionId: string
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('attendance_checks').delete().eq('id', checkId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance/${sessionId}`);
  return {};
}
