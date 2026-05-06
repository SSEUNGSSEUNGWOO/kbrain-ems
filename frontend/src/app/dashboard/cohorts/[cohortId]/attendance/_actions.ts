'use server';

import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

function getTime(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '').trim();
  return v || null;
}

function calcBreakMinutes(formData: FormData): number {
  const start = String(formData.get('break_start_time') ?? '').trim();
  const end = String(formData.get('break_end_time') ?? '').trim();
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

export async function createSession(
  cohortId: string,
  formData: FormData
): Promise<ActionResult> {
  const sessionDate = String(formData.get('session_date') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  if (!sessionDate) return { error: '수업 날짜는 필수입니다.' };

  try {
    await db.insert(sessions).values({
      cohortId,
      sessionDate,
      title: title || null,
      startTime: getTime(formData, 'start_time'),
      endTime: getTime(formData, 'end_time'),
      breakMinutes: calcBreakMinutes(formData),
      breakStartTime: getTime(formData, 'break_start_time'),
      breakEndTime: getTime(formData, 'break_end_time')
    });
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}

export async function createSessions(
  cohortId: string,
  sessionRows: { session_date: string; title: string | null; start_time: string | null; end_time: string | null; break_minutes: number }[]
): Promise<ActionResult> {
  if (sessionRows.length === 0) return { error: '추가할 수업이 없습니다.' };

  try {
    await db.insert(sessions).values(
      sessionRows.map((s) => ({
        cohortId,
        sessionDate: s.session_date,
        title: s.title,
        startTime: s.start_time,
        endTime: s.end_time,
        breakMinutes: s.break_minutes
      }))
    );
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}

export async function updateSession(
  id: string,
  cohortId: string,
  formData: FormData
): Promise<ActionResult> {
  const sessionDate = String(formData.get('session_date') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  if (!sessionDate) return { error: '수업 날짜는 필수입니다.' };

  try {
    await db.update(sessions).set({
      sessionDate,
      title: title || null,
      startTime: getTime(formData, 'start_time'),
      endTime: getTime(formData, 'end_time'),
      breakMinutes: calcBreakMinutes(formData),
      breakStartTime: getTime(formData, 'break_start_time'),
      breakEndTime: getTime(formData, 'break_end_time')
    }).where(eq(sessions.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}

export async function deleteSession(
  id: string,
  cohortId: string
): Promise<ActionResult> {
  try {
    await db.delete(sessions).where(eq(sessions.id, id));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}

export async function deleteSessions(
  ids: string[],
  cohortId: string
): Promise<ActionResult> {
  if (ids.length === 0) return {};

  try {
    await db.delete(sessions).where(inArray(sessions.id, ids));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.' };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}
