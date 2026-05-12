'use server';

import { createAdminClient } from '@/lib/supabase/server';

type SubmitInput = {
  responseId: string;
  responses: Record<string, string | number>;
};

/**
 * 익명 응답 제출.
 * responseId(=survey_responses.id)로 미제출 row를 update.
 */
export async function submitSurvey({ responseId, responses }: SubmitInput) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('survey_responses')
    .update({
      responses: responses as never,
      submitted_at: new Date().toISOString()
    })
    .eq('id', responseId)
    .is('submitted_at', null)
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: '이미 제출된 응답이거나 유효하지 않은 응답입니다.' };
  return { ok: true as const };
}
