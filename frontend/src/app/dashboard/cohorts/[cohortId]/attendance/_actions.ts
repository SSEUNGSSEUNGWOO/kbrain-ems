'use server';

import { createAdminClient } from '@/lib/supabase/server';
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

  const supabase = createAdminClient();
  const { error } = await supabase.from('sessions').insert({
    cohort_id: cohortId,
    session_date: sessionDate,
    title: title || null,
    start_time: getTime(formData, 'start_time'),
    end_time: getTime(formData, 'end_time'),
    break_minutes: calcBreakMinutes(formData),
    break_start_time: getTime(formData, 'break_start_time'),
    break_end_time: getTime(formData, 'break_end_time')
  });
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}

export async function createSessions(
  cohortId: string,
  sessionRows: { session_date: string; title: string | null; start_time: string | null; end_time: string | null; break_minutes: number }[]
): Promise<ActionResult> {
  if (sessionRows.length === 0) return { error: '추가할 수업이 없습니다.' };

  const supabase = createAdminClient();
  const { error } = await supabase.from('sessions').insert(
    sessionRows.map((s) => ({
      cohort_id: cohortId,
      session_date: s.session_date,
      title: s.title,
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes
    }))
  );
  if (error) return { error: error.message };

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

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('sessions')
    .update({
      session_date: sessionDate,
      title: title || null,
      start_time: getTime(formData, 'start_time'),
      end_time: getTime(formData, 'end_time'),
      break_minutes: calcBreakMinutes(formData),
      break_start_time: getTime(formData, 'break_start_time'),
      break_end_time: getTime(formData, 'break_end_time')
    })
    .eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}

export async function deleteSession(
  id: string,
  cohortId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('sessions').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}

export async function deleteSessions(
  ids: string[],
  cohortId: string
): Promise<ActionResult> {
  if (ids.length === 0) return {};

  const supabase = createAdminClient();
  const { error } = await supabase.from('sessions').delete().in('id', ids);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}
