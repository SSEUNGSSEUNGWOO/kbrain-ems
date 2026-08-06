import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { getBusinessStats, type CohortHistoryRow } from '@/lib/business-stats';
import { STAGE_LABEL, type CohortStage } from '@/lib/cohort-stage';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Dashboard: 대시보드' };

const STAGE_TONE: Record<CohortStage, string> = {
  recruiting: 'border-orange-200 bg-orange-50 text-orange-700',
  selecting: 'border-rose-200 bg-rose-50 text-rose-700',
  notifying: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  preparing: 'border-violet-200 bg-violet-50 text-violet-700',
  onboarding: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  active: 'border-blue-200 bg-blue-50 text-blue-700',
  finished: 'border-slate-200 bg-slate-50 text-slate-500',
  unset: 'border-amber-200 bg-amber-50 text-amber-700'
};

/** 지금 손이 가는 단계 — 종료·미정은 대시보드에서 제외 */
const LIVE_STAGES: CohortStage[] = [
  'recruiting',
  'selecting',
  'notifying',
  'preparing',
  'onboarding',
  'active'
];

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '일정 미정';
  const f = (s: string | null) => (s ? s.slice(2).replace(/-/g, '.') : '미정');
  return start === end ? f(start) : `${f(start)} ~ ${f(end)}`;
}

function LiveCohortRow({ row }: { row: CohortHistoryRow }) {
  return (
    <Link
      href={`/dashboard/cohorts/${row.cohortId}`}
      className='hover:bg-muted/50 flex items-center gap-3 rounded-lg border px-3 py-2'
    >
      <Badge variant='outline' className={cn('shrink-0 font-normal', STAGE_TONE[row.stage])}>
        {STAGE_LABEL[row.stage]}
      </Badge>
      <span className='min-w-0 flex-1 truncate text-sm font-medium'>{row.name}</span>
      <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
        {formatPeriod(row.startedAt, row.endedAt)}
      </span>
      <span className='shrink-0 text-xs tabular-nums'>
        신청 {row.applied} · 선발 {row.selected}
      </span>
    </Link>
  );
}

export default async function OverviewPage() {
  const stats = await getBusinessStats();
  const { kpi } = stats;

  const live = stats.cohorts
    .filter((c) => LIVE_STAGES.includes(c.stage))
    .toSorted(
      (a, b) =>
        LIVE_STAGES.indexOf(a.stage) - LIVE_STAGES.indexOf(b.stage) ||
        (a.startedAt ?? 'z').localeCompare(b.startedAt ?? 'z')
    );

  const generated = new Date(stats.generatedAt).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const KPI = [
    {
      label: '총 지원',
      value: kpi.totalApplied,
      suffix: '건',
      icon: Icons.forms,
      color: 'text-blue-500'
    },
    {
      label: '총 선발',
      value: kpi.totalSelected,
      suffix: '건',
      icon: Icons.circleCheck,
      color: 'text-emerald-500'
    },
    {
      label: '총 수료',
      value: kpi.totalCompleted,
      suffix: '명',
      icon: Icons.badgeCheck,
      color: 'text-amber-500'
    },
    {
      label: '전체 기수',
      value: kpi.cohortCount,
      suffix: '개',
      icon: Icons.calendar,
      color: 'text-violet-500'
    }
  ];

  const SHORTCUTS = [
    {
      label: '사업 진척률·KPI',
      desc: '과정별 실적 · 소속구분 · 기관별',
      href: '/dashboard/kpi-dashboard',
      icon: Icons.trendingUp
    },
    {
      label: '자료 다운로드',
      desc: '보고·정산용 엑셀 자료',
      href: '/dashboard/downloads',
      icon: Icons.download
    },
    {
      label: '캘린더',
      desc: '수업 · 인증평가 · 모집 일정',
      href: '/dashboard/calendar',
      icon: Icons.calendar
    }
  ];

  return (
    <PageContainer
      pageTitle='대시보드'
      pageDescription={`진행 중인 기수와 전체 요약 · ${generated} 집계`}
      pageHeaderAction={
        <Button variant='outline' size='sm' asChild>
          <Link href='/dashboard/kpi-dashboard'>
            <Icons.trendingUp className='mr-1.5' />
            상세 실적 보기
          </Link>
        </Button>
      }
    >
      <div className='space-y-6'>
        {/* 요약 */}
        <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
          {KPI.map((k) => (
            <Card key={k.label} className='py-4'>
              <CardContent className='flex items-center justify-between px-5'>
                <div>
                  <p className='text-muted-foreground text-xs'>{k.label}</p>
                  <p className='text-2xl leading-tight font-semibold tabular-nums'>
                    {k.value.toLocaleString()}
                    <span className='text-muted-foreground ml-1 text-sm font-normal'>
                      {k.suffix}
                    </span>
                  </p>
                </div>
                <k.icon className={`h-6 w-6 ${k.color}`} />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 진행 중인 기수 */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Icons.calendar className='h-4 w-4 text-blue-500' />
              진행 중인 기수
              <span className='text-muted-foreground text-xs font-normal'>{live.length}개</span>
            </CardTitle>
          </CardHeader>
          <CardContent className='grid gap-2'>
            {live.length === 0 ? (
              <p className='text-muted-foreground py-6 text-center text-sm'>
                모집·진행 중인 기수가 없습니다.
              </p>
            ) : (
              live.map((c) => <LiveCohortRow key={c.cohortId} row={c} />)
            )}
          </CardContent>
        </Card>

        {/* 바로가기 */}
        <div className='grid gap-3 sm:grid-cols-3'>
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className='hover:bg-muted/50 flex items-start gap-3 rounded-lg border px-4 py-3'
            >
              <s.icon className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
              <div className='min-w-0'>
                <p className='text-sm font-medium'>{s.label}</p>
                <p className='text-muted-foreground mt-0.5 text-xs'>{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
