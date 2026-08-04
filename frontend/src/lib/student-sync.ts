// application status ↔ students 동기화 공용 헬퍼.
//
// 5-상태 불변식: application 이 'selected' 또는 'same_day_cancel' 이면 해당 기수
// students row 가 존재해야 하고, 그 외(applied/rejected/pre_cancel)면 없어야 한다.
// (당일취소는 선발된 뒤 취소된 것이라 출결판·수료 집계에 남긴다 —
//  트리거 20260617000005_sync_students_with_same_day_cancel.sql 과 동일 기준)
//
// DB 트리거 trg_sync_students_on_app_status 가 같은 일을 하지만, 앱 레벨에서도
// 호출해 멱등 공존한다 (기존 확립 패턴). 'use server' 파일에 두면 공개 Server
// Action 이 되어 버리므로 일반 서버 모듈로 분리.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

/** students row 를 유지해야 하는 application status */
export const STUDENT_KEEP_STATUSES = ['selected', 'same_day_cancel'] as const;

export async function syncStudentSelected(
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

export async function removeStudentForCohort(
  supabase: SupabaseClient<Database>,
  applicantId: string,
  cohortId: string
): Promise<void> {
  // 이 기수의 application 이 keep 상태(selected·same_day_cancel)로 남아 있으면 유지.
  // (기존엔 'selected' 만 검사해서 selected → same_day_cancel 전환 시 잘못 삭제됐음)
  const { data: stillKept } = await supabase
    .from('applications')
    .select('id')
    .eq('applicant_id', applicantId)
    .eq('cohort_id', cohortId)
    .in('status', [...STUDENT_KEEP_STATUSES])
    .limit(1);
  if (stillKept && stillKept[0]) return;
  await supabase
    .from('students')
    .delete()
    .eq('applicant_id', applicantId)
    .eq('cohort_id', cohortId);
}
