'use server';

import { createAdminClient } from '@/lib/supabase/server';

type SubmitInput = {
  token: string;
  responses: Record<string, string | number>;
};

export async function submitSurvey({ token, responses }: SubmitInput) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('survey_responses')
    .update({
      responses: responses as never,
      submitted_at: new Date().toISOString()
    })
    .eq('token', token)
    .is('submitted_at', null)
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: '이미 제출된 응답이거나 유효하지 않은 토큰입니다.' };
  return { ok: true as const };
}
