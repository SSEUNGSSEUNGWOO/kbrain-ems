import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  computeDispatchStages,
  groupStagesByDate,
  isInDispatchWindow,
  isPendingActionable
} from '@/lib/dispatch-stages';
import { fetchDispatchInbox } from '@/lib/dispatch-inbox';
import { todayKst } from '@/lib/format';

export async function GET() {
  const supabase = createAdminClient();
  const today = todayKst();

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

  const { notifsByCohort, enabledByCohort } = await fetchDispatchInbox(supabase, cohortIds);

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
    // 그룹 단위로 카운트 (통합 row는 1건). UI row 개수와 일치.
    const groups = groupStagesByDate(stages);
    count += groups.filter((g) => isPendingActionable(g.state)).length;
  }

  return NextResponse.json({ count });
}
