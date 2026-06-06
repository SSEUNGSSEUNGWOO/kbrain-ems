'use server';

import { createAdminClient } from '@/lib/supabase/server';
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
  records: AttendanceRecord[]
): Promise<ActionResult> {
  const rows = records.map((r) => ({
    session_id: sessionId,
    student_id: r.student_id,
    status: r.status,
    note: r.note,
    arrival_time: r.arrival_time,
    departure_time: r.departure_time,
    credited_hours: r.credited_hours?.toString() ?? null
  }));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'session_id,student_id' });
  if (error) return { error: error.message };

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

  const { data, error } = await supabase
    .from('attendance_checks')
    .insert({
      session_id: sessionId,
      label: label.trim(),
      share_code: shortToken(),
      display_order: nextOrder,
      opens_at: opensAt,
      closes_at: closesAt,
      attendance_role: attendanceRole,
      criterion_at: criterionAt
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance/${sessionId}`);
  return { id: data.id };
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
