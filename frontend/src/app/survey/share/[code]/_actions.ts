'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

export type StartResult =
  | { ok: true; token: string }
  | { error: string };

/**
 * 익명 응답 시작.
 * share_code로 설문을 찾고, 응답 row(student_id NULL)를 만들어 token을 발급한다.
 * 학생 식별 X — 완전 익명.
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

  const token = randomUUID();
  const { error: insertErr } = await supabase.from('survey_responses').insert({
    survey_id: survey.id,
    token
  });
  if (insertErr) return { error: insertErr.message };

  return { ok: true, token };
}
