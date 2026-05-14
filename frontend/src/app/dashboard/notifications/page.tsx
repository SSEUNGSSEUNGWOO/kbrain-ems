import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  computeDispatchStages,
  groupStagesByDate,
  isInDispatchWindow,
  isStageInInboxRange
} from '@/lib/dispatch-stages';
import { fetchDispatchInbox } from '@/lib/dispatch-inbox';
import Link from 'next/link';
import { StageRow } from './_components/stage-row';
import { RangeSelector } from './_components/range-selector';

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
      today,
      maxDays
    )
  );

  const cohortIds = inWindow.map((c) => c.id);
  const { notifsByCohort, enabledByCohort } = await fetchDispatchInbox(supabase, cohortIds);

  const operatorIds = [
    ...new Set(
      [...notifsByCohort.values()]
        .flat()
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
      // 같은 ideal_send_date 단계 그룹화 → 임박한 그룹만 → 이른 날짜순
      const groups = groupStagesByDate(allStages)
        .filter((g) =>
          isStageInInboxRange(
            // group은 stage 형태가 아니라 변환. state/d_offset/ideal_send_date 활용
            {
              state: g.state,
              d_offset_from_today: g.d_offset_from_today,
              ideal_send_date: g.ideal_send_date,
              // 나머지 필드는 isStageInInboxRange에서 안 씀
              template: g.templates[0],
              label: '',
              hint: '',
              triggerColumn: 'started_at',
              latest_notification: null,
              recipientFilter: g.recipientFilter
            },
            maxDays
          )
        )
        .toSorted(sortByIdealDate);
      return { cohort: c, groups };
    })
    .filter((x) => x.groups.length > 0)
    .toSorted((a, b) =>
      sortByIdealDate(
        a.groups[0] ?? { ideal_send_date: null },
        b.groups[0] ?? { ideal_send_date: null }
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

        {cohortsWithStages.map(({ cohort, groups }) => {
          const headDue = groups.find(
            (g) => g.state === 'due' || g.state === 'overdue'
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
                  {groups.map((g) => (
                    <StageRow
                      key={g.templates.join(',')}
                      cohortId={cohort.id}
                      group={g}
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
