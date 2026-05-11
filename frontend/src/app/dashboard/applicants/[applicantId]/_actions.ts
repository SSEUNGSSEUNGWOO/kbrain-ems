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

  const { data: existing } = await supabase
    .from('students')
    .select('id')
    .eq('id', applicantId)
    .limit(1);

  if (existing && existing[0]) {
    // 이미 학생이면 cohort만 맞춰주고 정보 갱신
    await supabase
      .from('students')
      .update({
        cohort_id: cohortId,
        name: a.name,
        organization_id: a.organization_id,
        department: a.department,
        job_title: a.job_title,
        job_role: a.job_role,
        birth_date: a.birth_date,
        email: a.email,
        phone: a.phone,
        notes: a.notes
      })
      .eq('id', applicantId);
    return;
  }

  await supabase.from('students').insert({
    id: applicantId,
    cohort_id: cohortId,
    name: a.name,
    organization_id: a.organization_id,
    department: a.department,
    job_title: a.job_title,
    job_role: a.job_role,
    birth_date: a.birth_date,
    email: a.email,
    phone: a.phone,
    notes: a.notes
  });
}

async function removeStudentIfNoSelected(
  supabase: SupabaseClient<Database>,
  applicantId: string
): Promise<void> {
  // 이 사람이 더 이상 어떤 기수에도 selected가 아니면 학생 행 제거
  const { data: stillSelected } = await supabase
    .from('applications')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('status', 'selected')
    .limit(1);
  if (stillSelected && stillSelected[0]) return;
  await supabase.from('students').delete().eq('id', applicantId);
}

type ActionResult = { error?: string };

const VALID_STATUSES = [
  'applied',
  'shortlisted',
  'selected',
  'rejected',
  'withdrew'
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
    await removeStudentIfNoSelected(supabase, applicantId);
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
  const { error } = await supabase.from('applications').delete().eq('id', id);
  if (error) return { error: error.message };

  await removeStudentIfNoSelected(supabase, applicantId);

  revalidatePath(`/dashboard/applicants/${applicantId}`);
  revalidatePath('/dashboard/applicants');
  return {};
}
