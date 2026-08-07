'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { revalidatePath } from 'next/cache';
import { logActivity } from '@/lib/activity-log';

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

export async function createApplicant(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: '이름은 필수입니다.' };

  const supabase = createAdminClient();
  const organization_id = await getOrCreateOrg(
    supabase,
    String(formData.get('organization') ?? '')
  );

  const { data: created, error } = await supabase
    .from('applicants')
    .insert({
      name,
      organization_id,
      email: formValue(formData, 'email'),
      personal_email: formValue(formData, 'personal_email'),
      phone: formValue(formData, 'phone'),
      department: formValue(formData, 'department'),
      job_title: formValue(formData, 'job_title'),
      job_role: formValue(formData, 'job_role'),
      birth_date: formValue(formData, 'birth_date'),
      notes: formValue(formData, 'notes'),
      category: formValue(formData, 'category'),
      excluded_reason: formValue(formData, 'excluded_reason'),
      excluded_note: formValue(formData, 'excluded_note')
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'create',
    resourceType: 'applicant',
    resourceId: created?.id ?? null,
    summary: `지원자 추가: ${name}`
  });

  revalidatePath('/dashboard/applicants');
  return {};
}

export async function updateApplicant(id: string, formData: FormData): Promise<ActionResult> {
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
    personal_email: formValue(formData, 'personal_email'),
    phone: formValue(formData, 'phone'),
    department: formValue(formData, 'department'),
    job_title: formValue(formData, 'job_title'),
    job_role: formValue(formData, 'job_role'),
    birth_date: formValue(formData, 'birth_date'),
    notes: formValue(formData, 'notes'),
    category: formValue(formData, 'category'),
    excluded_reason: formValue(formData, 'excluded_reason'),
    excluded_note: formValue(formData, 'excluded_note')
  };

  const { error: applicantError } = await supabase.from('applicants').update(fields).eq('id', id);
  if (applicantError) return { error: applicantError.message };

  // 이 지원자의 모든 학생 enrollment 동기화
  // (students 에 category·예외 컬럼이 없으므로 제외)
  const { category: _cat, excluded_reason: _er, excluded_note: _en, ...studentFields } = fields;
  const { error: studentError } = await supabase
    .from('students')
    .update(studentFields)
    .eq('applicant_id', id);
  if (studentError) return { error: studentError.message };

  await logActivity({
    actionType: 'update',
    resourceType: 'applicant',
    resourceId: id,
    summary: `지원자 정보 수정: ${name}`
  });

  revalidatePath('/dashboard/applicants');
  revalidatePath(`/dashboard/applicants/${id}`);
  return {};
}

export async function deleteApplicant(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: target } = await supabase
    .from('applicants')
    .select('name')
    .eq('id', id)
    .maybeSingle();
  const { error } = await supabase.from('applicants').delete().eq('id', id);
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'delete',
    resourceType: 'applicant',
    resourceId: id,
    summary: `지원자 삭제: ${target?.name ?? id}`
  });

  revalidatePath('/dashboard/applicants');
  return {};
}

export async function deleteApplicants(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return {};

  const supabase = createAdminClient();
  const { error } = await supabase.from('applicants').delete().in('id', ids);
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'delete',
    resourceType: 'applicant',
    summary: `지원자 일괄 삭제: ${ids.length}명`
  });

  revalidatePath('/dashboard/applicants');
  return {};
}

// ============================================================================
// LMS 사전학습 명단 import
// ============================================================================

export type LmsRow = {
  course_code: string; // 'ai_literacy' | 'data_literacy'
  course_name: string;
  name: string;
  phone: string | null; // 정규화된 숫자만
  email: string | null;
  completed: boolean;
  completed_at: string | null; // 'YYYY-MM-DD'
  certificate_no: string | null;
};

/** 페이지 마운트 시 applicants의 매칭 키만 가져옴 (클라이언트 매칭용) */
export async function fetchApplicantsMatchKeys(): Promise<{
  error?: string;
  applicants?: { id: string; name: string; phone: string | null; email: string | null }[];
}> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('applicants').select('id, name, phone, email');
    if (error) throw new Error(error.message);
    return { applicants: data ?? [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'fetch 실패' };
  }
}

/** 매칭된 LMS row만 upsert. 호출 전 클라이언트에서 매칭 + 필터 완료된 것만 전달. */
export async function importMatchedLmsCompletions(
  rows: LmsRow[]
): Promise<{ error?: string; inserted?: number; updated?: number }> {
  try {
    if (rows.length === 0) return { inserted: 0, updated: 0 };
    const supabase = createAdminClient();

    // 같은 batch 내 (course_code, certificate_no) 중복 제거 (PostgreSQL ON CONFLICT 제약)
    // LMS 명단에 동일 수료번호가 2번 이상 있으면 마지막 row만 사용
    const certDedup = new Map<string, LmsRow>();
    const withoutCert: LmsRow[] = [];
    for (const r of rows) {
      if (r.certificate_no) {
        certDedup.set(`${r.course_code}::${r.certificate_no}`, r);
      } else {
        withoutCert.push(r);
      }
    }
    const withCert = [...certDedup.values()];

    let inserted = 0;
    let updated = 0;

    // supabase types.ts에 lms_completions 미반영. supabase.from은 method call로 호출하고 결과 builder만 cast (this 안 깨짐)
    type LmsBuilder = {
      upsert: (
        rows: LmsRow[],
        opts: { onConflict: string }
      ) => {
        select: (cols: string) => Promise<{
          data: { id: string; created_at: string; updated_at: string }[] | null;
          error: { message: string } | null;
        }>;
      };
      insert: (rows: LmsRow[]) => {
        select: (
          cols: string
        ) => Promise<{ data: { id: string }[] | null; error: { message: string } | null }>;
      };
    };

    if (withCert.length > 0) {
      // @ts-expect-error supabase types.ts에 lms_completions 미반영
      const builder = supabase.from('lms_completions') as unknown as LmsBuilder;
      const { data, error } = await builder
        .upsert(withCert, { onConflict: 'course_code,certificate_no' })
        .select('id, created_at, updated_at');
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        if (r.created_at === r.updated_at) inserted++;
        else updated++;
      }
    }

    if (withoutCert.length > 0) {
      // @ts-expect-error supabase types.ts에 lms_completions 미반영
      const builder = supabase.from('lms_completions') as unknown as LmsBuilder;
      const { data, error } = await builder.insert(withoutCert).select('id');
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }

    revalidatePath('/dashboard/applicants');
    return { inserted, updated };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'import 실패' };
  }
}
