'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

type Result = { error: string };

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^(01[016789])-?(\d{3,4})-?(\d{4})$/;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return input;
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function submitApplication(formData: FormData): Promise<Result | void> {
  const slug = str(formData, 'slug');
  const name = str(formData, 'name');
  const email = str(formData, 'email');
  const phone = str(formData, 'phone');
  const birthDate = str(formData, 'birthDate');
  const organizationName = str(formData, 'organizationName');
  const department = str(formData, 'department');
  const jobTitle = str(formData, 'jobTitle');
  const jobRole = str(formData, 'jobRole');
  const file = formData.get('applicationFile') as File | null;

  // 검증
  if (!name) return { error: '이름을 입력해주세요.' };
  if (!email || !EMAIL_RE.test(email)) return { error: '올바른 이메일 주소를 입력해주세요.' };
  const phoneNormalized = normalizePhone(phone);
  if (!PHONE_RE.test(phoneNormalized)) {
    return { error: '올바른 휴대전화 번호를 입력해주세요. (예: 010-1234-5678)' };
  }
  if (!organizationName) return { error: '소속 기관을 입력해주세요.' };

  // 파일 검증
  if (!file || file.size === 0) {
    return { error: '지원서 PDF 파일을 첨부해주세요.' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: '파일 크기는 10MB 이하여야 합니다.' };
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { error: 'PDF 파일만 업로드 가능합니다.' };
  }

  const supabase = createAdminClient();

  // cohort + 모집기간
  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name, application_start_at, application_end_at')
    .eq('recruiting_slug', slug)
    .maybeSingle();
  if (!cohort) return { error: '잘못된 신청 페이지입니다.' };

  const today = new Date().toISOString().slice(0, 10);
  if (cohort.application_start_at && today < cohort.application_start_at) {
    return { error: `모집 시작 전입니다. (${cohort.application_start_at} 시작)` };
  }
  if (cohort.application_end_at && today > cohort.application_end_at) {
    return { error: `모집이 마감되었습니다. (${cohort.application_end_at} 마감)` };
  }

  // organization get-or-create
  let organizationId: string | null = null;
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', organizationName)
    .maybeSingle();
  if (existingOrg) {
    organizationId = existingOrg.id;
  } else {
    const { data: createdOrg, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: organizationName })
      .select('id')
      .single();
    if (orgErr) return { error: `기관 등록 실패: ${orgErr.message}` };
    organizationId = createdOrg.id;
  }

  // 이메일·전화로 기존 applicant 검색 (둘 중 하나라도 일치하면 같은 사람으로 간주)
  const { data: byEmail } = await supabase
    .from('applicants')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  const { data: byPhone } = await supabase
    .from('applicants')
    .select('id')
    .eq('phone', phoneNormalized)
    .maybeSingle();

  const matchingIds = Array.from(
    new Set([byEmail?.id, byPhone?.id].filter((x): x is string => !!x))
  );

  // 중복 신청 검사 — 매칭된 applicant 중 누구라도 이미 cohort에 신청했나
  if (matchingIds.length > 0) {
    const { data: dupApp } = await supabase
      .from('applications')
      .select('id')
      .eq('cohort_id', cohort.id)
      .in('applicant_id', matchingIds)
      .maybeSingle();
    if (dupApp) {
      const matchedBy = byEmail && byPhone ? '이메일·전화번호' : byEmail ? '이메일' : '전화번호';
      return {
        error: `이미 같은 기수에 신청하신 ${matchedBy}입니다. 운영팀에 문의해 주세요.`
      };
    }
  }

  // applicant 재사용/생성 (이메일 매칭 우선, 그 다음 전화)
  let applicantId: string;
  if (byEmail) {
    applicantId = byEmail.id;
  } else if (byPhone) {
    applicantId = byPhone.id;
  } else {
    const { data: created, error: aErr } = await supabase
      .from('applicants')
      .insert({
        name,
        email,
        phone: phoneNormalized,
        organization_id: organizationId,
        department: department || null,
        job_title: jobTitle || null,
        job_role: jobRole || null,
        birth_date: birthDate || null
      })
      .select('id')
      .single();
    if (aErr || !created) return { error: aErr?.message ?? '지원자 등록 실패' };
    applicantId = created.id;
  }

  // 파일 업로드 → Storage
  const sanitizedName = file.name.replace(/[^\w.\-가-힣]/g, '_');
  const filePath = `${cohort.id}/${applicantId}_${Date.now()}_${sanitizedName}`;
  const { error: uploadErr } = await supabase.storage
    .from('application-files')
    .upload(filePath, file, {
      contentType: 'application/pdf',
      upsert: false
    });
  if (uploadErr) return { error: `파일 업로드 실패: ${uploadErr.message}` };

  // applications INSERT
  const { data: application, error: appErr } = await supabase
    .from('applications')
    .insert({
      applicant_id: applicantId,
      cohort_id: cohort.id,
      status: 'applied',
      applied_at: today,
      application_file_path: filePath,
      application_file_name: file.name,
      application_file_size: file.size
    })
    .select('id')
    .single();
  if (appErr || !application) {
    // 업로드된 파일 cleanup
    await supabase.storage.from('application-files').remove([filePath]);
    return { error: appErr?.message ?? '신청 저장 실패' };
  }

  redirect(`/apply/${slug}/done?id=${application.id}`);
}
