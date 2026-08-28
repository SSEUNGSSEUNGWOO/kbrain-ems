import { NextResponse, type NextRequest } from 'next/server';

import { createAdminClient } from '@/lib/supabase/server';
import { STAGE_CATALOG, type DispatchTemplate } from '@/lib/dispatch-stages';
import { buildDispatchPlan, executeDispatch } from '@/lib/sms-dispatch';

export const dynamic = 'force-dynamic';

// 교육 당일 아침 문자 발송.
//
// 타스온 규격에 예약 발송 파라미터가 없어서 우리가 그 시각에 호출한다 (docs/02).
// vercel.json 에 "30 22 * * *" 로 걸면 07:30 KST 다 — Cron 시간대는 항상 UTC 이므로
// UTC+9 를 빼서 전날 22:30 이 된다.
//
// Cron 은 공개 URL 에 GET 을 보낸다. 보호하지 않으면 주소를 아는 누구나 호출해 교육생
// 전원에게 문자를 발송시킬 수 있고, 되돌릴 수 없으며 비용도 나간다.

/** 오늘 보내야 할 단계. 개강 당일 도착 안내가 07:30 발송의 본래 대상이다. */
const DAILY_TEMPLATE: DispatchTemplate = 'd0_arrival';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const stageDef = STAGE_CATALOG.find((s) => s.code === DAILY_TEMPLATE);
  if (!stageDef) {
    return NextResponse.json({ ok: false, error: 'stage not found' }, { status: 500 });
  }

  // 오늘이 트리거 날짜인 기수만. d0_arrival 은 started_at 기준 offset 0 이다.
  const today = new Date();
  const target = new Date(today);
  target.setDate(target.getDate() - stageDef.offsetDays);
  const targetDate = target.toISOString().slice(0, 10);

  const supabase = createAdminClient();
  const { data: cohorts, error } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq(stageDef.triggerColumn, targetDate);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results = [];
  for (const cohort of cohorts ?? []) {
    // 기수별로 발송 단계가 꺼져 있으면 건너뛴다. row 가 없으면 enabled=true 가 기본값.
    const { data: config } = await supabase
      .from('cohort_dispatch_config')
      .select('enabled')
      .eq('cohort_id', cohort.id)
      .eq('template_code', DAILY_TEMPLATE)
      .maybeSingle();
    if (config?.enabled === false) {
      results.push({ cohort: cohort.name, skipped: 'disabled' });
      continue;
    }

    const planned = await buildDispatchPlan(cohort.id, DAILY_TEMPLATE);
    if (!planned.ok) {
      results.push({ cohort: cohort.name, error: planned.error });
      continue;
    }

    const outcome = await executeDispatch(planned.plan);
    results.push({
      cohort: cohort.name,
      dryRun: outcome.dryRun,
      sent: outcome.sent,
      alreadySent: outcome.skipped,
      failed: outcome.failed,
      excluded: planned.plan.review.excluded.length,
      batches: outcome.batchResults
    });
  }

  // 실패가 있으면 500 으로 알린다. Vercel Cron 은 재시도하지 않으므로 응답이 유일한 신호다.
  const hasFailure = results.some((r) => 'failed' in r && (r.failed ?? 0) > 0);
  return NextResponse.json(
    { ok: !hasFailure, date: targetDate, template: DAILY_TEMPLATE, cohorts: results },
    { status: hasFailure ? 500 : 200 }
  );
}
