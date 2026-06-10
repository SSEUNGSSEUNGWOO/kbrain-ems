import { createAdminClient } from './supabase/server';
import { getOperator } from './auth';

export type ActivityActionType =
  | 'login'
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'share_issue'
  | 'share_revoke'
  | 'auto_select'
  | 'upload';

export type ActivityResourceType =
  | 'cohort'
  | 'student'
  | 'applicant'
  | 'application'
  | 'survey'
  | 'diagnosis'
  | 'session'
  | 'assignment'
  | 'operator';

type Args = {
  actionType: ActivityActionType;
  resourceType?: ActivityResourceType;
  resourceId?: string | null;
  cohortId?: string | null;
  summary?: string;
  /**
   * 명시적으로 운영자 ID/이름을 넘기고 싶을 때 (예: 로그인 직후 — getOperator() 가 아직
   * 세션을 못 읽는 시점). 없으면 현재 세션의 getOperator() 사용.
   */
  operator?: { id: string | null; name: string | null };
};

/**
 * 운영자 활동 로그 기록.
 * 실패해도 본 작업에 영향 주지 않도록 silent.
 */
export async function logActivity({
  actionType,
  resourceType,
  resourceId,
  cohortId,
  summary,
  operator
}: Args): Promise<void> {
  try {
    const supabase = createAdminClient();
    let operatorId: string | null = operator?.id ?? null;
    let operatorName: string | null = operator?.name ?? null;
    if (!operator) {
      const op = await getOperator();
      operatorId = op?.id ?? null;
      operatorName = op?.name ?? null;
    }

    await supabase.from('activity_logs').insert({
      operator_id: operatorId,
      operator_name: operatorName,
      action_type: actionType,
      resource_type: resourceType ?? null,
      resource_id: resourceId ?? null,
      cohort_id: cohortId ?? null,
      summary: summary ?? null
    });
  } catch {
    // 본 작업 흐름에 영향 주지 않도록 silent
  }
}
