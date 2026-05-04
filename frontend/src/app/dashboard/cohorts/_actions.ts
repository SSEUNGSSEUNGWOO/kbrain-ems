'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

export async function createCohort(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  const startedAt = String(formData.get('started_at') ?? '').trim();
  const endedAt = String(formData.get('ended_at') ?? '').trim();

  if (!name) return { error: '기수 이름은 필수입니다.' };

  const supabase = await createClient();
  const { error } = await supabase.from('cohorts').insert({
    name,
    started_at: startedAt || null,
    ended_at: endedAt || null
  });

  if (error) return { error: error.message };

  revalidatePath('/dashboard/cohorts');
  return {};
}

export async function updateCohort(id: string, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  const startedAt = String(formData.get('started_at') ?? '').trim();
  const endedAt = String(formData.get('ended_at') ?? '').trim();

  if (!name) return { error: '기수 이름은 필수입니다.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('cohorts')
    .update({ name, started_at: startedAt || null, ended_at: endedAt || null })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/cohorts');
  return {};
}

export async function deleteCohort(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('cohorts').delete().eq('id', id);

  if (error) {
    if (error.code === '23503') return { error: '교육생이 등록된 기수는 삭제할 수 없습니다.' };
    return { error: error.message };
  }

  revalidatePath('/dashboard/cohorts');
  return {};
}
