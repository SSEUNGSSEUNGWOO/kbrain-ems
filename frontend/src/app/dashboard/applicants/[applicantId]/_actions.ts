'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';

async function syncStudentSelected(
  supabase: SupabaseClient<Database>,
  applicantId: string,
  cohortId: string
): Promise<void> {
  const { data: applicantRows } = await supabase
    .from('applicants')
    .select(
      'id, name, organization_id, department, job_title, job_role, birth_date, email, phone, notes'
    )
    .eq('id', applicantId)
    .limit(1);
  const a = applicantRows?.[0];
  if (!a) return;

  // 이 기수에 이미 student row 있나?
  const { data: existing } = await supabase
    .from('students')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('cohort_id', cohortId)
    .limit(1);

  const fields = {
    name: a.name,
    organization_id: a.organization_id,
    department: a.department,
    job_title: a.job_title,
    job_role: a.job_role,
    birth_date: a.birth_date,
    email: a.email,
    phone: a.phone,
    notes: a.notes
  };

  if (existing && existing[0]) {
    await supabase.from('students').update(fields).eq('id', existing[0].id);
    return;
  }

  await supabase.from('students').insert({
    applicant_id: applicantId,
    cohort_id: cohortId,
    ...fields
  });
}

async function removeStudentForCohort(
  supabase: SupabaseClient<Database>,
  applicantId: string,
  cohortId: string
): Promise<void> {
  // 이 기수의 application 이 더 이상 'selected' 가 아니면 이 기수 student row 제거
  const { data: stillSelected } = await supabase
    .from('applications')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('cohort_id', cohortId)
    .eq('status', 'selected')
    .limit(1);
  if (stillSelected && stillSelected[0]) return;
  await supabase
    .from('students')
    .delete()
    .eq('applicant_id', applicantId)
    .eq('cohort_id', cohortId);
}

type ActionResult = { error?: string };

const VALID_STATUSES = [
  'applied',
  'selected',
  'rejected',
  'pre_cancel',
  'same_day_cancel'
] as const;

const VALID_REJECTED_STAGES = ['docs', 'interview', 'final'] as const;

function formValue(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '').trim();
  return v || null;
}

export async function createApplication(
  applicantId: string,
  formData: FormData
): Promise<ActionResult> {
  const cohortId = formValue(formData, 'cohort_id');
  if (!cohortId) return { error: '기수는 필수입니다.' };

  const status = String(formData.get('status') ?? 'applied');
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return { error: '잘못된 상태값입니다.' };
  }

  const rejectedStageRaw = formValue(formData, 'rejected_stage');
  const rejectedStage =
    status === 'rejected' &&
    rejectedStageRaw &&
    VALID_REJECTED_STAGES.includes(
      rejectedStageRaw as (typeof VALID_REJECTED_STAGES)[number]
    )
      ? rejectedStageRaw
      : null;

  const supabase = createAdminClient();
  const { error } = await supabase.from('applications').insert({
    applicant_id: applicantId,
    cohort_id: cohortId,
    status,
    rejected_stage: rejectedStage,
    applied_at: formValue(formData, 'applied_at'),
    decided_at: formValue(formData, 'decided_at'),
    note: formValue(formData, 'note')
  });
  if (error) return { error: error.message };

  if (status === 'selected') {
    await syncStudentSelected(supabase, applicantId, cohortId);
  }

  revalidatePath(`/dashboard/applicants/${applicantId}`);
  revalidatePath('/dashboard/applicants');
  return {};
}

export async function updateApplication(
  id: string,
  applicantId: string,
  formData: FormData
): Promise<ActionResult> {
  const cohortId = formValue(formData, 'cohort_id');
  if (!cohortId) return { error: '기수는 필수입니다.' };

  const status = String(formData.get('status') ?? 'applied');
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return { error: '잘못된 상태값입니다.' };
  }

  const rejectedStageRaw = formValue(formData, 'rejected_stage');
  const rejectedStage =
    status === 'rejected' &&
    rejectedStageRaw &&
    VALID_REJECTED_STAGES.includes(
      rejectedStageRaw as (typeof VALID_REJECTED_STAGES)[number]
    )
      ? rejectedStageRaw
      : null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('applications')
    .update({
      cohort_id: cohortId,
      status,
      rejected_stage: rejectedStage,
      applied_at: formValue(formData, 'applied_at'),
      decided_at: formValue(formData, 'decided_at'),
      note: formValue(formData, 'note')
    })
    .eq('id', id);
  if (error) return { error: error.message };

  if (status === 'selected') {
    await syncStudentSelected(supabase, applicantId, cohortId);
  } else {
    await removeStudentForCohort(supabase, applicantId, cohortId);
  }

  revalidatePath(`/dashboard/applicants/${applicantId}`);
  revalidatePath('/dashboard/applicants');
  return {};
}

export async function updateApplicationStatus(
  id: string,
  applicantId: string,
  status: string,
  rejectedStageRaw: string | null
): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return { error: '잘못된 상태값입니다.' };
  }
  const rejectedStage =
    status === 'rejected' &&
    rejectedStageRaw &&
    VALID_REJECTED_STAGES.includes(
      rejectedStageRaw as (typeof VALID_REJECTED_STAGES)[number]
    )
      ? rejectedStageRaw
      : null;

  const supabase = createAdminClient();

  const { data: current } = await supabase
    .from('applications')
    .select('cohort_id, status, decided_at')
    .eq('id', id)
    .maybeSingle();
  if (!current) return { error: '지원 이력을 찾을 수 없습니다.' };

  const decidedFromStatus =
    status === 'selected' ||
    status === 'rejected' ||
    status === 'pre_cancel' ||
    status === 'same_day_cancel';
  const nextDecidedAt =
    decidedFromStatus && !current.decided_at
      ? new Date().toISOString().slice(0, 10)
      : current.decided_at;

  const { error } = await supabase
    .from('applications')
    .update({
      status,
      rejected_stage: rejectedStage,
      decided_at: nextDecidedAt
    })
    .eq('id', id);
  if (error) return { error: error.message };

  if (status === 'selected') {
    await syncStudentSelected(supabase, applicantId, current.cohort_id);
  } else if (current.status === 'selected') {
    await removeStudentForCohort(supabase, applicantId, current.cohort_id);
  }

  revalidatePath(`/dashboard/applicants/${applicantId}`);
  revalidatePath('/dashboard/applicants');
  return {};
}

export async function deleteApplication(
  id: string,
  applicantId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  // 삭제 전 cohort_id 확보 — 해당 기수 student row 정리에 필요
  const { data: appRow } = await supabase
    .from('applications')
    .select('cohort_id')
    .eq('id', id)
    .maybeSingle();
  const cohortId = appRow?.cohort_id;

  const { error } = await supabase.from('applications').delete().eq('id', id);
  if (error) return { error: error.message };

  if (cohortId) {
    await removeStudentForCohort(supabase, applicantId, cohortId);
  }

  revalidatePath(`/dashboard/applicants/${applicantId}`);
  revalidatePath('/dashboard/applicants');
  return {};
}
