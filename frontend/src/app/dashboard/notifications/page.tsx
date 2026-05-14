import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  computeDispatchStages,
  isInDispatchWindow,
  isStageInInboxRange,
  STAGE_CATALOG
} from '@/lib/dispatch-stages';
import Link from 'next/link';
import { StageRow } from './_components/stage-row';
import { RangeSelector } from './_components/range-selector';

const STAGE_TEMPLATE_CODES = STAGE_CATALOG.map((t) => t.code);

const todayIso = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDdayLabel = (dOffset: number | null): string => {
  if (dOffset === null) return '-';
  if (dOffset === 0) return 'D-day';
  if (dOffset < 0) return `D${dOffset}`;
  return `D+${dOffset}`;
};

type Props = {
  searchParams: Promise<{ range?: string }>;
};

export default async function NotificationsInboxPage({ searchParams }: Props) {
  const { range } = await searchParams;
  const maxDays = range === '14' ? 14 : range === '30' ? 30 : 7;

  const supabase = createAdminClient();
  const today = todayIso();

  const { data: cohortRows } = await supabase
    .from('cohorts')
    .select('id, name, started_at, ended_at, decided_at, category')
    .order('started_at', { ascending: true });

  const inWindow = (cohortRows ?? []).filter((c) =>
    isInDispatchWindow(
      { decided_at: c.decided_at, started_at: c.started_at, ended_at: c.ended_at },
      today
    )
  );

  const cohortIds = inWindow.map((c) => c.id);
  const [{ data: notifs }, { data: configRows }] = await Promise.all([
    supabase
      .from('notifications')
      .select(
        'id, cohort_id, template_code, status, channel, channels, sent_at, sent_by_operator_id'
      )
      .in('cohort_id', cohortIds.length > 0 ? cohortIds : ['__none__'])
      .in('template_code', [...STAGE_TEMPLATE_CODES])
      .order('sent_at', { ascending: false }),
    supabase
      .from('cohort_dispatch_config')
      .select('cohort_id, template_code, enabled')
      .in('cohort_id', cohortIds.length > 0 ? cohortIds : ['__none__'])
  ]);

  const notifsByCohort = new Map<string, typeof notifs>();
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

  const operatorIds = [
    ...new Set(
      (notifs ?? [])
        .map((n) => n.sent_by_operator_id)
        .filter((x): x is string => !!x)
    )
  ];
  const operatorNameById = new Map<string, string>();
  if (operatorIds.length > 0) {
    const { data: ops } = await supabase
      .from('operators')
      .select('id, name')
      .in('id', operatorIds);
    for (const o of ops ?? []) operatorNameById.set(o.id, o.name);
  }

  const sortByIdealDate = (a: { ideal_send_date: string | null }, b: { ideal_send_date: string | null }) => {
    const av = a.ideal_send_date ?? '9999-12-31';
    const bv = b.ideal_send_date ?? '9999-12-31';
    return av.localeCompare(bv);
  };

  const cohortsWithStages = inWindow
    .map((c) => {
      const ns = notifsByCohort.get(c.id) ?? [];
      const enabledMap = enabledByCohort.get(c.id);
      const allStages = computeDispatchStages(
        { decided_at: c.decided_at, started_at: c.started_at, ended_at: c.ended_at },
        today,
        ns,
        enabledMap
      );
      // 임박한 미발송 단계만 (overdue/due + upcoming 중 +maxDays 이내). 이른 발송일 순 정렬.
      const stages = allStages
        .filter((s) => isStageInInboxRange(s, maxDays))
        .toSorted(sortByIdealDate);
      return { cohort: c, stages };
    })
    .filter((x) => x.stages.length > 0)
    // cohort 자체도 가장 이른 미발송 단계 날짜순
    .toSorted((a, b) =>
      sortByIdealDate(
        a.stages[0] ?? { ideal_send_date: null },
        b.stages[0] ?? { ideal_send_date: null }
      )
    );

  return (
    <PageContainer
      pageTitle='알림 발송 (beta)'
      pageDescription='진행 중·예정 기수의 단계별 발송 체크리스트. 외부 메일·SMS 발송 후 여기에 완료 기록을 남깁니다.'
      pageHeaderAction={<RangeSelector current={maxDays} />}
    >
      <div className='space-y-4'>
        {cohortsWithStages.length === 0 && (
          <div className='border-muted bg-muted/30 text-muted-foreground rounded-lg border p-8 text-center text-sm'>
            현재 시점에 발송 대상 기수가 없습니다.
          </div>
        )}

        {cohortsWithStages.map(({ cohort, stages }) => {
          // 가장 가까운 due/overdue 단계를 헤더 D-day로
          const headDue = stages.find(
            (s) => s.state === 'due' || s.state === 'overdue'
          );
          const dOffset = headDue?.d_offset_from_today ?? null;
          return (
            <Card key={cohort.id}>
              <CardHeader className='flex flex-row items-center justify-between gap-2 pb-3'>
                <div className='flex items-center gap-3'>
                  <Link
                    href={`/dashboard/cohorts/${cohort.id}`}
                    className='hover:underline'
                  >
                    <CardTitle className='text-base'>{cohort.name}</CardTitle>
                  </Link>
                  {dOffset !== null && (
                    <Badge variant='outline'>{formatDdayLabel(dOffset)}</Badge>
                  )}
                  {cohort.started_at && (
                    <span className='text-muted-foreground text-xs'>
                      개강 {cohort.started_at}
                    </span>
                  )}
                </div>
                <Link
                  href={`/dashboard/cohorts/${cohort.id}/notifications`}
                  className='text-muted-foreground hover:text-foreground text-xs underline'
                >
                  설정·로그 →
                </Link>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {stages.map((st) => (
                    <StageRow
                      key={st.template}
                      cohortId={cohort.id}
                      stage={st}
                      operatorNameById={operatorNameById}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
