'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

async function getOrCreateOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgName: string
): Promise<string | null> {
  const name = orgName.trim();
  if (!name) return null;

  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', name)
    .single();
  if (existing) return existing.id;

  const { data: created } = await supabase
    .from('organizations')
    .insert({ name })
    .select('id')
    .single();
  return created?.id ?? null;
}

export async function createStudent(
  cohortId: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const supabase = await createClient();
  const orgName = String(formData.get('organization') ?? '').trim();
  const organizationId = orgName ? await getOrCreateOrg(supabase, orgName) : null;

  const { error } = await supabase.from('students').insert({
    cohort_id: cohortId,
    organization_id: organizationId,
    name,
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    department: String(formData.get('department') ?? '').trim() || null,
    job_title: String(formData.get('job_title') ?? '').trim() || null,
    job_role: String(formData.get('job_role') ?? '').trim() || null,
    birth_date: String(formData.get('birth_date') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null
  });

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  return {};
}

export async function updateStudent(
  id: string,
  cohortId: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const supabase = await createClient();
  const orgName = String(formData.get('organization') ?? '').trim();
  const organizationId = orgName ? await getOrCreateOrg(supabase, orgName) : null;

  const { error } = await supabase
    .from('students')
    .update({
      organization_id: organizationId,
      name,
      email: String(formData.get('email') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      department: String(formData.get('department') ?? '').trim() || null,
      job_title: String(formData.get('job_title') ?? '').trim() || null,
      job_role: String(formData.get('job_role') ?? '').trim() || null,
      birth_date: String(formData.get('birth_date') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null
    })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  return {};
}

export async function deleteStudent(
  id: string,
  cohortId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('students').delete().eq('id', id);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  return {};
}

export async function deleteStudents(
  ids: string[],
  cohortId: string
): Promise<ActionResult> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase.from('students').delete().in('id', ids);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  return {};
}
