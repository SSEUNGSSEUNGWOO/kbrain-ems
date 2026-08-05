import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import { getBusinessStats, type CohortHistoryRow } from '@/lib/business-stats';
import { AFFILIATION_COLORS, UNCLASSIFIED_LABEL } from '@/lib/affiliation';
import { CategoryPieChart } from './_components/category-pie-chart';
import { CohortHistoryTable } from './_components/cohort-history-table';
import { OrganizationStatsTable } from './_components/organization-stats-table';

export const metadata = { title: 'Dashboard: 통계' };

const CATEGORIES: { key: string; label: string; tone: string }[] = [
  { key: 'champion', label: '1. AI 챔피언', tone: 'border-blue-300 text-blue-700' },
  { key: 'general', label: '2. 일반교육', tone: 'border-emerald-300 text-emerald-700' },
  { key: 'special', label: '3. 특화교육', tone: 'border-amber-300 text-amber-700' },
  { key: 'experts', label: '4. 전문인재', tone: 'border-violet-300 text-violet-700' }
];

export default async function OverviewPage() {
  const stats = await getBusinessStats();
  const { kpi } = stats;

  const byCategory = new Map<string, CohortHistoryRow[]>();
  for (const c of CATEGORIES) byCategory.set(c.key, []);
  const uncategorized: CohortHistoryRow[] = [];
  for (const row of stats.cohorts) {
    if (row.category && byCategory.has(row.category)) byCategory.get(row.category)!.push(row);
    else uncategorized.push(row);
  }

  const affTotalApplied = stats.affiliations.reduce((s, a) => s + a.applied, 0);
  const affTotalSelected = stats.affiliations.reduce((s, a) => s + a.selected, 0);
  const donut = (key: 'applied' | 'selected') =>
    stats.affiliations.map((a) => ({
      name: a.label,
      value: a[key],
      color: AFFILIATION_COLORS[a.label] ?? AFFILIATION_COLORS[UNCLASSIFIED_LABEL]
    }));

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

  return (
    <PageContainer
      pageTitle='대시보드'
      pageDescription={`사업 전체 지원·선발·수료 통계 · ${generated} 집계`}
    >
      <div className='space-y-8'>
        {/* KPI */}
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

        {/* 과정별 이력 */}
        <div className='space-y-6'>
          <h2 className='text-base font-semibold'>과정별 진행 이력</h2>
          {CATEGORIES.map((cat) => (
            <CohortHistoryTable
              key={cat.key}
              label={cat.label}
              tone={cat.tone}
              rows={byCategory.get(cat.key) ?? []}
            />
          ))}
          <CohortHistoryTable
            label='기타'
            tone='border-slate-300 text-slate-600'
            rows={uncategorized}
          />
          <p className='text-muted-foreground text-xs'>
            행을 클릭하면 소속구분별 상세가 펼쳐집니다 · 경쟁률 = 신청 ÷ 정원 · 선발 = 선발 +
            당일취소 (사전취소 제외) · 응시 = 인증평가 참여 · 합격 = 인증평가 합격 (— 는 해당 없음
            또는 미채점) · 테스트 인원 제외
          </p>
        </div>

        {/* 소속구분별 */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Icons.workspace className='h-4 w-4 text-cyan-500' />
              소속구분별 지원·선발
            </CardTitle>
          </CardHeader>
          <CardContent className='grid gap-8 xl:grid-cols-2'>
            <div className='grid gap-6'>
              <div>
                <p className='text-muted-foreground mb-2 text-xs font-medium'>지원 분포</p>
                <CategoryPieChart data={donut('applied')} unit='건' />
              </div>
              <div>
                <p className='text-muted-foreground mb-2 text-xs font-medium'>선발 분포</p>
                <CategoryPieChart data={donut('selected')} unit='건' />
              </div>
            </div>
            <div className='self-start overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>구분</TableHead>
                    <TableHead className='text-right'>지원</TableHead>
                    <TableHead className='text-right'>비중</TableHead>
                    <TableHead className='text-right'>선발</TableHead>
                    <TableHead className='text-right'>비중</TableHead>
                    <TableHead className='text-right'>선발률</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.affiliations.map((a) => (
                    <TableRow key={a.label}>
                      <TableCell className='font-medium'>
                        <span className='flex items-center gap-2'>
                          <span
                            className='h-2.5 w-2.5 shrink-0 rounded-full'
                            style={{
                              backgroundColor:
                                AFFILIATION_COLORS[a.label] ??
                                AFFILIATION_COLORS[UNCLASSIFIED_LABEL]
                            }}
                          />
                          {a.label}
                        </span>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{a.applied}</TableCell>
                      <TableCell className='text-muted-foreground text-right tabular-nums'>
                        {affTotalApplied > 0 ? Math.round((a.applied / affTotalApplied) * 100) : 0}%
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{a.selected}</TableCell>
                      <TableCell className='text-muted-foreground text-right tabular-nums'>
                        {affTotalSelected > 0
                          ? Math.round((a.selected / affTotalSelected) * 100)
                          : 0}
                        %
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {a.applied > 0 ? Math.round((a.selected / a.applied) * 100) : 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className='bg-muted/40 font-medium'>
                    <TableCell>합계</TableCell>
                    <TableCell className='text-right tabular-nums'>{affTotalApplied}</TableCell>
                    <TableCell className='text-right'>100%</TableCell>
                    <TableCell className='text-right tabular-nums'>{affTotalSelected}</TableCell>
                    <TableCell className='text-right'>100%</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {affTotalApplied > 0
                        ? Math.round((affTotalSelected / affTotalApplied) * 100)
                        : 0}
                      %
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* 기관별 */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Icons.teams className='h-4 w-4 text-blue-500' />
              기관별 지원·선발 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrganizationStatsTable rows={stats.organizations} />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
