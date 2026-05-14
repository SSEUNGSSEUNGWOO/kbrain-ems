// 알림 발송 inbox용 공통 fetch — notifications + cohort_dispatch_config.
// Server Component / API route 전용 (createAdminClient 의존).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { STAGE_CATALOG, type NotificationLite } from './dispatch-stages';

const STAGE_TEMPLATE_CODES = STAGE_CATALOG.map((t) => t.code);

type Sb = SupabaseClient<Database>;

export type InboxBundle = {
  notifsByCohort: Map<string, NotificationLite[]>;
  enabledByCohort: Map<string, Map<string, boolean>>;
};

/**
 * 주어진 cohortIds에 대해 notifications(stage 단계만) + cohort_dispatch_config을 병렬 fetch.
 * 결과를 cohort_id로 그룹화된 Map으로 반환.
 */
export async function fetchDispatchInbox(supabase: Sb, cohortIds: string[]): Promise<InboxBundle> {
  if (cohortIds.length === 0) {
    return { notifsByCohort: new Map(), enabledByCohort: new Map() };
  }

  const [{ data: notifs }, { data: configRows }] = await Promise.all([
    supabase
      .from('notifications')
      .select(
        'id, cohort_id, template_code, status, channel, channels, sent_at, sent_by_operator_id'
      )
      .in('cohort_id', cohortIds)
      .in('template_code', [...STAGE_TEMPLATE_CODES])
      .order('sent_at', { ascending: false }),
    supabase
      .from('cohort_dispatch_config')
      .select('cohort_id, template_code, enabled')
      .in('cohort_id', cohortIds)
  ]);

  const notifsByCohort = new Map<string, NotificationLite[]>();
  for (const n of notifs ?? []) {
    if (!n.cohort_id) continue;
    const arr = notifsByCohort.get(n.cohort_id) ?? [];
    arr.push(n);
    notifsByCohort.set(n.cohort_id, arr);
  }

  const enabledByCohort = new Map<string, Map<string, boolean>>();
  for (const r of configRows ?? []) {
    if (!enabledByCohort.has(r.cohort_id)) enabledByCohort.set(r.cohort_id, new Map());
    enabledByCohort.get(r.cohort_id)!.set(r.template_code, r.enabled);
  }

  return { notifsByCohort, enabledByCohort };
}
