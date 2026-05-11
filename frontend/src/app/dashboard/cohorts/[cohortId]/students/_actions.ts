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

  const { data: created, error } = await supabase
    .from('organizations')
    .insert({ name })
    .select('id')
    .single();
  if (error) return null;
  return created?.id ?? null;
}

export async function createStudent(
  cohortId: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const supabase = createAdminClient();

  const orgName = String(formData.get('organization') ?? '').trim();
  const organization_id = orgName ? await getOrCreateOrg(supabase, orgName) : null;

  const fields = {
    organization_id,
    name,
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    department: String(formData.get('department') ?? '').trim() || null,
    job_title: String(formData.get('job_title') ?? '').trim() || null,
    job_role: String(formData.get('job_role') ?? '').trim() || null,
    birth_date: String(formData.get('birth_date') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null
  };

  // 같은 사람을 지원자에서 먼저 등록(또는 재사용)한 뒤 학생으로 승격
  const { data: created, error: applicantError } = await supabase
    .from('applicants')
    .insert(fields)
    .select('id')
    .single();
  if (applicantError || !created) {
    return { error: applicantError?.message ?? '지원자 생성에 실패했습니다.' };
  }
  const applicantId = created.id;

  // applications row 존재 여부 확인 후 없을 때만 insert (onConflictDoNothing 대체)
  const { data: existingApp } = await supabase
    .from('applications')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('cohort_id', cohortId)
    .limit(1);

  if (!existingApp || existingApp.length === 0) {
    const { error: appError } = await supabase.from('applications').insert({
      applicant_id: applicantId,
      cohort_id: cohortId,
      status: 'selected',
      decided_at: new Date().toISOString().slice(0, 10)
    });
    if (appError) return { error: appError.message };
  }

  const { error: studentError } = await supabase
    .from('students')
    .insert({ id: applicantId, cohort_id: cohortId, ...fields });
  if (studentError) return { error: studentError.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  return {};
}

export async function updateStudent(
  id: string,
  cohortId: string,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const supabase = createAdminClient();

  const orgName = String(formData.get('organization') ?? '').trim();
  const organization_id = orgName ? await getOrCreateOrg(supabase, orgName) : null;

  const fields = {
    organization_id,
    name,
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    department: String(formData.get('department') ?? '').trim() || null,
    job_title: String(formData.get('job_title') ?? '').trim() || null,
    job_role: String(formData.get('job_role') ?? '').trim() || null,
    birth_date: String(formData.get('birth_date') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null
  };

  const { error: studentError } = await supabase
    .from('students')
    .update(fields)
    .eq('id', id);
  if (studentError) return { error: studentError.message };

  // 같은 id의 지원자도 동기화
  const { error: applicantError } = await supabase
    .from('applicants')
    .update(fields)
    .eq('id', id);
  if (applicantError) return { error: applicantError.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  revalidatePath(`/dashboard/applicants/${id}`);
  return {};
}

export async function deleteStudent(
  id: string,
  cohortId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { error: delError } = await supabase
    .from('students')
    .delete()
    .eq('id', id);
  if (delError) return { error: delError.message };

  // 합격 기록은 보존하되 'withdrew'(철회)로 변경
  // COALESCE(decided_at, CURRENT_DATE)는 단순화 — selected 상태인 application들을 조회한 뒤
  // 각각의 decided_at을 보존하면서 status만 업데이트
  const { data: apps } = await supabase
    .from('applications')
    .select('id, decided_at')
    .eq('applicant_id', id)
    .eq('cohort_id', cohortId)
    .eq('status', 'selected');

  const today = new Date().toISOString().slice(0, 10);
  for (const app of apps ?? []) {
    const { error: updError } = await supabase
      .from('applications')
      .update({
        status: 'withdrew',
        decided_at: app.decided_at ?? today
      })
      .eq('id', app.id);
    if (updError) return { error: updError.message };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  return {};
}

/**
 * 신청자를 학생으로 승격 — applications.status='selected' + students INSERT.
 * 이미 selected이거나 student row가 있으면 idempotent.
 */
export async function promoteApplicant(
  cohortId: string,
  applicantId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { data: applicant } = await supabase
    .from('applicants')
    .select('id, name, email, phone, organization_id, department, job_title, job_role, birth_date, notes')
    .eq('id', applicantId)
    .maybeSingle();
  if (!applicant) return { error: '지원자 정보를 찾을 수 없습니다.' };

  // students INSERT (이미 있으면 conflict → 무시)
  const { error: stuErr } = await supabase.from('students').insert({
    id: applicant.id,
    cohort_id: cohortId,
    organization_id: applicant.organization_id,
    name: applicant.name,
    email: applicant.email,
    phone: applicant.phone,
    department: applicant.department,
    job_title: applicant.job_title,
    job_role: applicant.job_role,
    birth_date: applicant.birth_date,
    notes: applicant.notes
  });
  if (stuErr && !stuErr.message.toLowerCase().includes('duplicate')) {
    return { error: stuErr.message };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error: appErr } = await supabase
    .from('applications')
    .update({ status: 'selected', decided_at: today })
    .eq('applicant_id', applicantId)
    .eq('cohort_id', cohortId);
  if (appErr) return { error: appErr.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  return {};
}

/**
 * 합격 취소 — students DELETE + applications.status='applied'로 되돌림.
 */
export async function unpromoteApplicant(
  cohortId: string,
  applicantId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { error: delErr } = await supabase
    .from('students')
    .delete()
    .eq('id', applicantId)
    .eq('cohort_id', cohortId);
  if (delErr) return { error: delErr.message };

  const { error: appErr } = await supabase
    .from('applications')
    .update({ status: 'applied', decided_at: null })
    .eq('applicant_id', applicantId)
    .eq('cohort_id', cohortId);
  if (appErr) return { error: appErr.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  return {};
}

export async function deleteStudents(
  ids: string[],
  cohortId: string
): Promise<ActionResult> {
  if (ids.length === 0) return {};

  const supabase = createAdminClient();

  const { error: delError } = await supabase
    .from('students')
    .delete()
    .in('id', ids);
  if (delError) return { error: delError.message };

  const { data: apps } = await supabase
    .from('applications')
    .select('id, decided_at')
    .in('applicant_id', ids)
    .eq('cohort_id', cohortId)
    .eq('status', 'selected');

  const today = new Date().toISOString().slice(0, 10);
  for (const app of apps ?? []) {
    const { error: updError } = await supabase
      .from('applications')
      .update({
        status: 'withdrew',
        decided_at: app.decided_at ?? today
      })
      .eq('id', app.id);
    if (updError) return { error: updError.message };
  }

  revalidatePath(`/dashboard/cohorts/${cohortId}/students`);
  revalidatePath('/dashboard/applicants');
  return {};
}
