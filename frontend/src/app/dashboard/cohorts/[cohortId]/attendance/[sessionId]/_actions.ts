'use server';

import { db } from '@/lib/db';
import { attendanceRecords } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
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
    sessionId,
    studentId: r.student_id,
    status: r.status,
    note: r.note,
    arrivalTime: r.arrival_time,
    departureTime: r.departure_time,
    creditedHours: r.credited_hours?.toString() ?? null
  }));

  try {
    await db
      .insert(attendanceRecords)
      .values(rows)
      .onConflictDoUpdate({
        target: [attendanceRecords.sessionId, attendanceRecords.studentId],
        set: {
          status: sql`excluded.status`,
          note: sql`excluded.note`,
          arrivalTime: sql`excluded.arrival_time`,
          departureTime: sql`excluded.departure_time`,
          creditedHours: sql`excluded.credited_hours`,
          updatedAt: sql`now()`
        }
      });
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance/${sessionId}`);
  return {};
}
