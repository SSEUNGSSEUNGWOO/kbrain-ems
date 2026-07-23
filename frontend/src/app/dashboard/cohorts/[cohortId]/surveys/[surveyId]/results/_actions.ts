'use server';

import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logActivity } from '@/lib/activity-log';
import type { Json } from '@/lib/supabase/types';

type ActionResult = { error?: string; code?: string | null };

function generateShareCode(): string {
  // 11자 URL-safe base64 (충돌 가능성 무시할 수 있음)
  return randomBytes(8).toString('base64url');
}

/** 결과 공유용 share_code 발급. 이미 발급되어 있으면 그 값 그대로 반환. */
export async function issueResultsShareCode(
  cohortId: string,
  surveyId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { data: cur } = await supabase
    .from('surveys')
    .select('results_share_code')
    .eq('id', surveyId)
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (cur?.results_share_code) return { code: cur.results_share_code };

  // 충돌 회피 — unique 위반 시 재시도 (최대 3회)
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateShareCode();
    const { error } = await supabase
      .from('surveys')
      .update({ results_share_code: code })
      .eq('id', surveyId)
      .eq('cohort_id', cohortId);
    if (!error) {
      await logActivity({
        actionType: 'share_issue',
        resourceType: 'survey',
        resourceId: surveyId,
        cohortId,
        summary: '만족도 결과 공유 링크 발급'
      });
      revalidatePath(`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/results`);
      return { code };
    }
    if (!/unique|duplicate/i.test(error.message)) {
      return { error: error.message };
    }
  }
  return { error: '공유 코드 발급에 실패했습니다. 다시 시도하세요.' };
}

/**
 * 서술형/사유 응답 개별 삭제 — survey_responses.responses jsonb 에서 해당 questionId key 만 제거.
 * 척도(likert10) 답변에는 사용하지 않는다 (평균·분포 통계가 깨짐).
 */
export async function deleteTextAnswer(
  cohortId: string,
  surveyId: string,
  responseId: string,
  questionId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { data: row, error: fetchErr } = await supabase
    .from('survey_responses')
    .select('id, responses, survey_id')
    .eq('id', responseId)
    .eq('survey_id', surveyId)
    .maybeSingle();
  if (fetchErr) return { error: fetchErr.message };
  if (!row) return { error: '응답을 찾을 수 없습니다.' };

  // text 타입만 지우도록 안전장치 — 문항 타입 확인
  const { data: q } = await supabase
    .from('survey_questions')
    .select('id, type')
    .eq('id', questionId)
    .eq('survey_id', surveyId)
    .maybeSingle();
  if (!q) return { error: '문항을 찾을 수 없습니다.' };
  if (q.type !== 'text') return { error: '서술형 응답만 삭제할 수 있습니다.' };

  const current = (row.responses ?? {}) as { [key: string]: Json | undefined };
  const nextResponses: { [key: string]: Json | undefined } = { ...current };
  delete nextResponses[questionId];

  const { error: updateErr } = await supabase
    .from('survey_responses')
    .update({ responses: nextResponses })
    .eq('id', responseId);
  if (updateErr) return { error: updateErr.message };

  await logActivity({
    actionType: 'delete',
    resourceType: 'survey',
    resourceId: surveyId,
    cohortId,
    summary: `서술형 응답 개별 삭제 (response=${responseId}, question=${questionId})`
  });

  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/results`);
  return {};
}

/** 발급된 share_code 회수 — NULL 로 비공개 전환. */
export async function revokeResultsShareCode(
  cohortId: string,
  surveyId: string
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('surveys')
    .update({ results_share_code: null })
    .eq('id', surveyId)
    .eq('cohort_id', cohortId);
  if (error) return { error: error.message };

  await logActivity({
    actionType: 'share_revoke',
    resourceType: 'survey',
    resourceId: surveyId,
    cohortId,
    summary: '만족도 결과 공유 링크 회수'
  });

  revalidatePath(`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/results`);
  return { code: null };
}
