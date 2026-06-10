'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

type ActionResult = { error?: string; ok?: boolean };

function normalizeName(s: string): string {
  return s.replace(/\s+/g, '').trim();
}

function lastFourDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/**
 * 응답 시작 전 — 이름 + 전화 뒷 4자리로 cohort 학생과 매칭.
 * 통합 설문(additional_cohort_ids) 처럼 여러 cohort 연결되어 있으면 모두 검색.
 * 매칭 성공 시 students 정보 반환, 실패 시 에러.
 */
export async function verifyStudent(
  checklistId: string,
  rawName: string,
  rawPhoneLast4: string
): Promise<{
  error?: string;
  student?: {
    id: string;
    name: string;
    organizationName: string | null;
    phone: string | null;
  };
}> {
  const name = normalizeName(rawName);
  const phoneLast4 = rawPhoneLast4.replace(/\D/g, '');
  if (!name) return { error: '이름을 입력해주세요.' };
  if (phoneLast4.length !== 4) {
    return { error: '전화번호 뒷 4자리를 정확히 입력해주세요.' };
  }

  const supabase = createAdminClient();
  const { data: cl } = await supabase
    .from('pretraining_checklists')
    .select('cohort_id, closes_at')
    .eq('id', checklistId)
    .maybeSingle();
  if (!cl) return { error: '체크리스트를 찾을 수 없습니다.' };
  if (cl.closes_at && new Date(cl.closes_at) <= new Date()) {
    return { error: '응답 기간이 마감되었습니다.' };
  }

  // cohort 학생 중 이름 일치 후보 조회 (공백 무시)
  const { data: candidates } = await supabase
    .from('students')
    .select('id, name, phone, organizations(name)')
    .eq('cohort_id', cl.cohort_id)
    .ilike('name', name);

  const match = (candidates ?? []).find(
    (s) => lastFourDigits(s.phone) === phoneLast4
  );
  if (!match) {
    return {
      error:
        '등록된 교육생 명단에서 찾을 수 없습니다. 이름·연락처 확인 후 다시 시도하시거나 운영팀에 문의해주세요.'
    };
  }

  return {
    student: {
      id: match.id,
      name: match.name,
      organizationName:
        (match.organizations as { name: string } | { name: string }[] | null) &&
        (Array.isArray(match.organizations)
          ? match.organizations[0]?.name ?? null
          : match.organizations?.name ?? null),
      phone: match.phone
    }
  };
}

export async function submitChecklistResponse(
  checklistId: string,
  studentId: string,
  payload: {
    name: string;
    organization: string | null;
    phone: string | null;
    answers: Record<string, 'yes' | 'no'>;
  }
): Promise<ActionResult> {
  const supabase = createAdminClient();

  // 마감 여부 + student 가 실제로 이 checklist 의 cohort 학생인지 재검증 (변조 방지)
  const { data: cl } = await supabase
    .from('pretraining_checklists')
    .select('cohort_id, closes_at')
    .eq('id', checklistId)
    .maybeSingle();
  if (!cl) return { error: '체크리스트를 찾을 수 없습니다.' };
  if (cl.closes_at && new Date(cl.closes_at) <= new Date()) {
    return { error: '응답 기간이 마감되었습니다.' };
  }
  const { data: stu } = await supabase
    .from('students')
    .select('id, cohort_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!stu || stu.cohort_id !== cl.cohort_id) {
    return { error: '잘못된 접근입니다. 다시 인증해주세요.' };
  }

  // 같은 student 재제출 시 가장 최신만 유지 — 기존 응답 삭제
  await supabase
    .from('pretraining_checklist_responses')
    .delete()
    .eq('checklist_id', checklistId)
    .eq('student_id', studentId);

  const { error } = await supabase.from('pretraining_checklist_responses').insert({
    checklist_id: checklistId,
    student_id: studentId,
    name: payload.name,
    organization: payload.organization,
    phone: payload.phone,
    answers: payload.answers as unknown as Json,
    submitted_at: new Date().toISOString()
  });
  if (error) return { error: error.message };

  return { ok: true };
}
