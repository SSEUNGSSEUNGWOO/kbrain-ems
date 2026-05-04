'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

const path = (cohortId: string) => `/dashboard/cohorts/${cohortId}/assignments`;

export async function createAssignment(cohortId: string, formData: FormData): Promise<ActionResult> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: '과제명은 필수입니다.' };

  const supabase = await createClient();
  const { error } = await supabase.from('assignments').insert({
    cohort_id: cohortId,
    title,
    description: String(formData.get('description') ?? '').trim() || null,
    due_date: String(formData.get('due_date') ?? '').trim() || null
  });

  if (error) return { error: error.message };
  revalidatePath(path(cohortId));
  return {};
}

export async function updateAssignment(id: string, cohortId: string, formData: FormData): Promise<ActionResult> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: '과제명은 필수입니다.' };

  const supabase = await createClient();
  const { error } = await supabase.from('assignments').update({
    title,
    description: String(formData.get('description') ?? '').trim() || null,
    due_date: String(formData.get('due_date') ?? '').trim() || null
  }).eq('id', id);

  if (error) return { error: error.message };
  revalidatePath(path(cohortId));
  return {};
}

export async function deleteAssignment(id: string, cohortId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('assignments').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(path(cohortId));
  return {};
}

export async function deleteAssignments(ids: string[], cohortId: string): Promise<ActionResult> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase.from('assignments').delete().in('id', ids);
  if (error) return { error: error.message };
  revalidatePath(path(cohortId));
  return {};
}
