'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

function getTime(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '').trim();
  return v || null;
}

function getBreakMinutes(formData: FormData): number {
  const v = parseInt(String(formData.get('break_minutes') ?? '0'), 10);
  return isNaN(v) || v < 0 ? 0 : v;
}

export async function createSession(
  cohortId: string,
  formData: FormData
): Promise<ActionResult> {
  const sessionDate = String(formData.get('session_date') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  if (!sessionDate) return { error: '수업 날짜는 필수입니다.' };

  const supabase = await createClient();
  const { error } = await supabase.from('sessions').insert({
    cohort_id: cohortId,
    session_date: sessionDate,
    title: title || null,
    start_time: getTime(formData, 'start_time'),
    end_time: getTime(formData, 'end_time'),
    break_minutes: getBreakMinutes(formData)
  });

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}

export async function createSessions(
  cohortId: string,
  sessions: { session_date: string; title: string | null; start_time: string | null; end_time: string | null; break_minutes: number }[]
): Promise<ActionResult> {
  if (sessions.length === 0) return { error: '추가할 수업이 없습니다.' };

  const supabase = await createClient();
  const { error } = await supabase.from('sessions').insert(
    sessions.map((s) => ({ cohort_id: cohortId, ...s }))
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

  const supabase = await createClient();
  const { error } = await supabase
    .from('sessions')
    .update({
      session_date: sessionDate,
      title: title || null,
      start_time: getTime(formData, 'start_time'),
      end_time: getTime(formData, 'end_time'),
      break_minutes: getBreakMinutes(formData)
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
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').delete().in('id', ids);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/attendance`);
  return {};
}
