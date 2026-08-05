'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getSpecialCourseHistoryByApplicant } from '@/lib/special-course-history';
import { revalidatePath } from 'next/cache';

type CertRow = {
  student_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  passed: boolean | null;
  total_score: number | null;
  grade: string | null;
  section_scores: Record<string, number | string | null>;
  exam_no: string | null;
  cert_no: string | null;
  exam_date: string | null;
};

type CertTable = {
  select: (cols: string) => {
    eq: (
      col: string,
      val: string
    ) => PromiseLike<{
      data: (CertRow & { id: string })[] | null;
      error: { message: string } | null;
    }>;
  };
  insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  update: (row: Record<string, unknown>) => {
    eq: (
      col: string,
      val: string
    ) => { eq: (col2: string, val2: string) => PromiseLike<{ error: { message: string } | null }> };
  };
};

/** 자기주도형 기수의 인증 응시 결과를, 같은 트랙 원 과정 미수료·미인증자의
 *  certification_results 로 복사/갱신한다. 이후 원 과정 수료 페이지·통계는
 *  기존 판정 로직 그대로 자동 반영된다. */
export async function syncRetroactiveCertifications(
  cohortId: string
): Promise<{ error?: string; inserted?: number; updated?: number }> {
  const supabase = createAdminClient();

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name, delivery_method')
    .eq('id', cohortId)
    .maybeSingle();
  if (!cohort) return { error: '기수를 찾을 수 없습니다.' };
  if (cohort.delivery_method !== '자기주도형')
    return { error: '자기주도형 기수에서만 사용할 수 있습니다.' };

  const track = cohort.name.includes('그린')
    ? ('그린' as const)
    : cohort.name.includes('블루')
      ? ('블루' as const)
      : null;
  const historyMap = await getSpecialCourseHistoryByApplicant(track);
  const targets = [...historyMap.entries()].filter(
    ([, v]) => v.status === 'exam_only_left' || v.status === 'not_certified'
  );
  if (targets.length === 0) return { inserted: 0, updated: 0 };

  // 이번 기수 학생 + 응시 결과
  const { data: sdStudents } = await supabase
    .from('students')
    .select('id, applicant_id')
    .eq('cohort_id', cohortId);
  const sdStudentByApplicant = new Map(
    (sdStudents ?? []).filter((s) => s.applicant_id).map((s) => [s.applicant_id!, s.id])
  );
  const certTable = supabase.from(
    'certification_results' as unknown as 'cohorts'
  ) as unknown as CertTable;
  const sdCertRes = await certTable
    .select(
      'id, student_id, name, phone, email, passed, total_score, grade, section_scores, exam_no, cert_no, exam_date'
    )
    .eq('cohort_id', cohortId);
  const sdCertByStudent = new Map(
    (sdCertRes.data ?? []).filter((c) => c.student_id).map((c) => [c.student_id!, c])
  );

  // 원 과정 학생 매핑 (대상자의 applicant_id → 원 과정 student_id)
  const originCohortIds = [...new Set(targets.map(([, v]) => v.cohortId))];
  const { data: originStudents } = await supabase
    .from('students')
    .select('id, applicant_id, cohort_id')
    .in('cohort_id', originCohortIds);
  const originStudentByKey = new Map(
    (originStudents ?? [])
      .filter((s) => s.applicant_id)
      .map((s) => [`${s.applicant_id}|${s.cohort_id}`, s.id])
  );

  let inserted = 0;
  let updated = 0;
  for (const [applicantId, history] of targets) {
    const sdStudentId = sdStudentByApplicant.get(applicantId);
    if (!sdStudentId) continue; // 이번 기수 미선발
    const sdCert = sdCertByStudent.get(sdStudentId);
    if (!sdCert) continue; // 아직 미응시
    const originStudentId = originStudentByKey.get(`${applicantId}|${history.cohortId}`);
    if (!originStudentId) continue;

    const payload = {
      passed: sdCert.passed,
      total_score: sdCert.total_score,
      grade: sdCert.grade,
      section_scores: sdCert.section_scores ?? {},
      exam_no: sdCert.exam_no,
      cert_no: sdCert.cert_no,
      exam_date: sdCert.exam_date,
      source_cohort_id: cohortId
    };

    if (history.status === 'exam_only_left') {
      // 원 과정에 응시 기록 자체가 없음 → 복사 insert (수료 요건 충족)
      const { error } = await certTable.insert({
        cohort_id: history.cohortId,
        student_id: originStudentId,
        name: sdCert.name,
        phone: sdCert.phone,
        email: sdCert.email,
        ...payload
      });
      if (error) return { error: `${sdCert.name} 반영 실패: ${error.message}` };
      inserted++;
    } else if (history.status === 'not_certified' && sdCert.passed === true) {
      // 원 과정 불합격 기록 → 재응시 합격으로 갱신
      const { error } = await certTable
        .update(payload)
        .eq('cohort_id', history.cohortId)
        .eq('student_id', originStudentId);
      if (error) return { error: `${sdCert.name} 갱신 실패: ${error.message}` };
      updated++;
    }
  }

  for (const originId of originCohortIds) {
    revalidatePath(`/dashboard/cohorts/${originId}/certification`);
    revalidatePath(`/dashboard/cohorts/${originId}/completion`);
  }
  revalidatePath(`/dashboard/cohorts/${cohortId}/certification`);
  return { inserted, updated };
}
