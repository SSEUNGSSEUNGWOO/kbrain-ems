import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  computeDispatchStages,
  isInDispatchWindow,
  isPendingActionable,
  STAGE_CATALOG,
  type NotificationLite
} from '@/lib/dispatch-stages';

const STAGE_TEMPLATE_CODES = STAGE_CATALOG.map((t) => t.code);

const todayIso = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export async function GET() {
  const supabase = createAdminClient();
  const today = todayIso();

  const { data: cohorts } = await supabase
    .from('cohorts')
    .select('id, started_at, ended_at, decided_at');

  const inWindow = (cohorts ?? []).filter((c) =>
    isInDispatchWindow(
      { decided_at: c.decided_at, started_at: c.started_at, ended_at: c.ended_at },
      today
    )
  );
  const cohortIds = inWindow.map((c) => c.id);

  if (cohortIds.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  const [{ data: notifs }, { data: configRows }] = await Promise.all([
    supabase
      .from('notifications')
      .select(
        'id, cohort_id, template_code, status, channel, channels, sent_at, sent_by_operator_id'
      )
      .in('cohort_id', cohortIds)
      .in('template_code', [...STAGE_TEMPLATE_CODES]),
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
    if (!enabledByCohort.has(r.cohort_id))
      enabledByCohort.set(r.cohort_id, new Map());
    enabledByCohort.get(r.cohort_id)!.set(r.template_code, r.enabled);
  }

  let count = 0;
  for (const c of inWindow) {
    const ns = notifsByCohort.get(c.id) ?? [];
    const enabledMap = enabledByCohort.get(c.id);
    const stages = computeDispatchStages(
      { decided_at: c.decided_at, started_at: c.started_at, ended_at: c.ended_at },
      today,
      ns,
      enabledMap
    );
    count += stages.filter((s) => isPendingActionable(s.state)).length;
  }

  return NextResponse.json({ count });
}
