'use server';

import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();

  const rows = records.map((r) => ({
    session_id: sessionId,
    student_id: r.student_id,
    status: r.status,
    note: r.note,
    arrival_time: r.arrival_time,
    departure_time: r.departure_time,
    credited_hours: r.credited_hours
  }));

  const { error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'session_id,student_id' });

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance/${sessionId}`);
  return {};
}
