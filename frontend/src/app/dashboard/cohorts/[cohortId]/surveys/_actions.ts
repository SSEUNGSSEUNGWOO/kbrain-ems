'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

export async function updateSurvey(
  cohortId: string,
  id: string,
  fields: { title: string; shareCode: string }
): Promise<ActionResult> {
  const title = fields.title.trim();
  const shareCode = fields.shareCode.trim();
  if (!title) return { error: '제목을 입력해주세요.' };
  if (!shareCode) return { error: '공유 코드를 입력해주세요.' };

  const supabase = createAdminClient();

  // share_code 중복 검사 (자기 자신 제외)
  const { data: dup } = await supabase
    .from('surveys')
    .select('id')
    .eq('share_code', shareCode)
    .neq('id', id)
    .maybeSingle();
  if (dup) return { error: '이미 다른 설문에서 사용 중인 공유 코드입니다.' };

  const { error } = await supabase
    .from('surveys')
    .update({ title, share_code: shareCode })
    .eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys`);
  return {};
}

export async function deleteSurvey(cohortId: string, id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  // surveys 삭제 → survey_questions, survey_responses CASCADE 자동 삭제
  const { error } = await supabase.from('surveys').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys`);
  return {};
}
