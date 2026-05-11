'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

type LookupInput = { code: string; name: string };

export type LookupResult =
  | {
      ok: true;
      token: string;
      student: {
        name: string;
        organizationName: string | null;
        department: string | null;
        birthDate: string | null;
      };
    }
  | { error: string };

export async function lookupStudent({ code, name }: LookupInput): Promise<LookupResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: '이름을 입력해주세요.' };

  const supabase = createAdminClient();

  const { data: survey } = await supabase
    .from('surveys')
    .select('id, cohort_id, closes_at')
    .eq('share_code', code)
    .maybeSingle();
  if (!survey) return { error: '설문을 찾을 수 없습니다.' };

  if (survey.closes_at && new Date(survey.closes_at) < new Date()) {
    return { error: '마감된 설문입니다.' };
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, name, birth_date, department, organizations(name)')
    .eq('cohort_id', survey.cohort_id)
    .eq('name', trimmed)
    .maybeSingle();
  if (!student) {
    return { error: '등록된 교육생이 아닙니다. 이름을 다시 확인해 주세요.' };
  }

  const org = student.organizations as unknown as { name: string } | null;

  // 완료 여부 체크 — 응답 내용과 분리된 별도 테이블에서만 추적
  const { data: completion } = await supabase
    .from('survey_completions')
    .select('id')
    .eq('survey_id', survey.id)
    .eq('student_id', student.id)
    .maybeSingle();
  if (completion) {
    return { error: '이미 응답하신 설문입니다. 참여해 주셔서 감사합니다.' };
  }

  // 토큰 조회·발급 — 응답 진행 중에는 student_id 유지, 제출 시 submit action이 NULL로 변환
  let token: string;
  const { data: existing } = await supabase
    .from('survey_responses')
    .select('token')
    .eq('survey_id', survey.id)
    .eq('student_id', student.id)
    .maybeSingle();
  if (existing) {
    token = existing.token;
  } else {
    token = randomUUID();
    const { error: insertErr } = await supabase.from('survey_responses').insert({
      survey_id: survey.id,
      student_id: student.id,
      token
    });
    if (insertErr) return { error: insertErr.message };
  }

  return {
    ok: true,
    token,
    student: {
      name: student.name,
      organizationName: org?.name ?? null,
      department: student.department,
      birthDate: student.birth_date
    }
  };
}
