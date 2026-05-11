'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

async function getOrCreateOrg(
  supabase: SupabaseClient<Database>,
  orgName: string
): Promise<string | null> {
  const name = orgName.trim();
  if (!name) return null;

  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', name)
    .limit(1);
  if (existing && existing[0]) return existing[0].id;

  const { data: created } = await supabase
    .from('organizations')
    .insert({ name })
    .select('id')
    .single();
  return created?.id ?? null;
}

function formValue(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '').trim();
  return v || null;
}

export async function createApplicant(
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const supabase = createAdminClient();
  const organization_id = await getOrCreateOrg(
    supabase,
    String(formData.get('organization') ?? '')
  );

  const { error } = await supabase.from('applicants').insert({
    name,
    organization_id,
    email: formValue(formData, 'email'),
    phone: formValue(formData, 'phone'),
    department: formValue(formData, 'department'),
    job_title: formValue(formData, 'job_title'),
    job_role: formValue(formData, 'job_role'),
    birth_date: formValue(formData, 'birth_date'),
    notes: formValue(formData, 'notes')
  });
  if (error) return { error: error.message };

  revalidatePath('/dashboard/applicants');
  return {};
}

export async function updateApplicant(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const supabase = createAdminClient();
  const organization_id = await getOrCreateOrg(
    supabase,
    String(formData.get('organization') ?? '')
  );

  const fields = {
    name,
    organization_id,
    email: formValue(formData, 'email'),
    phone: formValue(formData, 'phone'),
    department: formValue(formData, 'department'),
    job_title: formValue(formData, 'job_title'),
    job_role: formValue(formData, 'job_role'),
    birth_date: formValue(formData, 'birth_date'),
    notes: formValue(formData, 'notes')
  };

  const { error: applicantError } = await supabase
    .from('applicants')
    .update(fields)
    .eq('id', id);
  if (applicantError) return { error: applicantError.message };

  // 같은 id로 등록된 학생이 있으면 같이 갱신
  const { error: studentError } = await supabase
    .from('students')
    .update(fields)
    .eq('id', id);
  if (studentError) return { error: studentError.message };

  revalidatePath('/dashboard/applicants');
  revalidatePath(`/dashboard/applicants/${id}`);
  return {};
}

export async function deleteApplicant(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('applicants').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/applicants');
  return {};
}

export async function deleteApplicants(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return {};

  const supabase = createAdminClient();
  const { error } = await supabase.from('applicants').delete().in('id', ids);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/applicants');
  return {};
}
