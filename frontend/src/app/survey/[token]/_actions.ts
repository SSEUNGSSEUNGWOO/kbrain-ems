'use server';

import { createAdminClient } from '@/lib/supabase/server';

type SubmitInput = {
  token: string;
  responses: Record<string, string | number>;
};

/**
 * 익명 제출.
 *  1) survey_responses 에서 token으로 row 확인 (student_id, survey_id)
 *  2) survey_completions 에 (survey_id, student_id) 기록 — 학생 식별과 응답 분리
 *  3) survey_responses 에 responses+submitted_at 저장 + student_id를 NULL 로 비움
 *
 * 운영자가 service_role로 DB를 직접 봐도 응답 내용과 응답자 매칭이 끊긴다.
 */
export async function submitSurvey({ token, responses }: SubmitInput) {
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from('survey_responses')
    .select('id, survey_id, student_id, submitted_at')
    .eq('token', token)
    .maybeSingle();

  if (!row) return { error: '유효하지 않은 토큰입니다.' };
  if (row.submitted_at) return { error: '이미 제출된 응답입니다.' };
  if (!row.student_id) return { error: '유효하지 않은 응답입니다.' };

  // 1. 완료 기록 (응답 내용과 분리)
  const { error: completionErr } = await supabase
    .from('survey_completions')
    .insert({ survey_id: row.survey_id, student_id: row.student_id });

  if (completionErr) {
    if (completionErr.message.includes('duplicate')) {
      return { error: '이미 응답하신 설문입니다.' };
    }
    return { error: completionErr.message };
  }

  // 2. 응답 저장 + student_id 익명화 (NULL)
  const { error: updateErr } = await supabase
    .from('survey_responses')
    .update({
      responses: responses as never,
      submitted_at: new Date().toISOString(),
      student_id: null
    })
    .eq('id', row.id);

  if (updateErr) return { error: updateErr.message };

  return { ok: true as const };
}
