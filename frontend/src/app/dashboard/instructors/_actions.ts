'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

function formValue(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '').trim();
  return v || null;
}

export async function createInstructor(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const kindRaw = String(formData.get('kind') ?? 'main');
  const kind = kindRaw === 'sub' ? 'sub' : 'main';

  const supabase = createAdminClient();
  const { error } = await supabase.from('instructors').insert({
    name,
    kind,
    affiliation: formValue(formData, 'affiliation'),
    specialty: formValue(formData, 'specialty'),
    email: formValue(formData, 'email'),
    phone: formValue(formData, 'phone'),
    notes: formValue(formData, 'notes')
  });

  if (error) return { error: error.message };

  revalidatePath('/dashboard/instructors');
  return {};
}

export async function updateInstructor(id: string, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('instructors')
    .update({
      name,
      affiliation: formValue(formData, 'affiliation'),
      specialty: formValue(formData, 'specialty'),
      email: formValue(formData, 'email'),
      phone: formValue(formData, 'phone'),
      notes: formValue(formData, 'notes')
    })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/instructors');
  return {};
}

export async function deleteInstructor(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('instructors').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/instructors');
  return {};
}
