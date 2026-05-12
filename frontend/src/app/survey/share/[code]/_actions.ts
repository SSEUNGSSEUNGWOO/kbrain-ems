'use server';

import { createAdminClient } from '@/lib/supabase/server';

export type StartResult =
  | { ok: true; responseId: string }
  | { error: string };

/**
 * 익명 응답 시작.
 * share_code로 설문을 찾고, 응답 row(student_id NULL)를 만들어 id를 반환한다.
 * 학생 식별 X — 완전 익명. row.id 자체가 응답 URL slug 역할.
 */
export async function startSurvey(code: string): Promise<StartResult> {
  const supabase = createAdminClient();

  const { data: survey } = await supabase
    .from('surveys')
    .select('id, closes_at')
    .eq('share_code', code)
    .maybeSingle();
  if (!survey) return { error: '설문을 찾을 수 없습니다.' };

  if (survey.closes_at && new Date(survey.closes_at) < new Date()) {
    return { error: '마감된 설문입니다.' };
  }

  const { data, error: insertErr } = await supabase
    .from('survey_responses')
    .insert({ survey_id: survey.id })
    .select('id')
    .single();
  if (insertErr || !data) return { error: insertErr?.message ?? '응답 시작에 실패했습니다.' };

  return { ok: true, responseId: data.id };
}
