import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { CohortDownloads, type CohortOption } from './_components/cohort-downloads';

export const metadata = { title: 'Dashboard: 자료 다운로드' };

// 사업 전체(기수 무관) 자료
const GLOBAL_ITEMS: { label: string; desc: string; href: string; restricted?: boolean }[] = [
  {
    label: '지원자·선발 현황',
    desc: '전 과정 횡단 — 총괄요약 · 과정별 · 기관별 · 전체 명단 5개 시트',
    href: '/api/reports/selection-status',
    restricted: true
  },
  {
    label: '지원자 마스터',
    desc: '지원자 전체 목록 (지원자 관리 화면의 필터가 아닌 전체 기준)',
    href: '/api/applicants/export',
    restricted: true
  }
];

export default async function DownloadsPage() {
  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const { data: cohorts } = await supabase
    .from('cohorts')
    .select('id, name, category, started_at')
    .order('started_at', { ascending: false, nullsFirst: false });

  const options: CohortOption[] = (cohorts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    startedAt: c.started_at
  }));

  return (
    <PageContainer
      pageTitle='자료 다운로드'
      pageDescription='보고·정산에 쓰는 엑셀 자료를 한곳에서 내려받습니다'
    >
      <div className='flex flex-col gap-6'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Icons.workspace className='h-4 w-4 text-cyan-500' />
              사업 전체
            </CardTitle>
          </CardHeader>
          <CardContent className='grid gap-2 sm:grid-cols-2'>
            {GLOBAL_ITEMS.map((item) => {
              const blocked = item.restricted && hidePersonal;
              return (
                <div
                  key={item.label}
                  className='flex items-start justify-between gap-3 rounded-lg border px-4 py-3'
                >
                  <div className='min-w-0'>
                    <p className='text-sm font-medium'>{item.label}</p>
                    <p className='text-muted-foreground mt-0.5 text-xs'>
                      {blocked ? '개인정보 포함 — 열람 권한이 없습니다' : item.desc}
                    </p>
                  </div>
                  {blocked ? (
                    <Button variant='outline' size='sm' disabled>
                      제한
                    </Button>
                  ) : (
                    <Button variant='outline' size='sm' asChild>
                      <a href={item.href} download>
                        <Icons.download className='mr-1.5' />
                        받기
                      </a>
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Icons.calendar className='h-4 w-4 text-blue-500' />
              기수별
            </CardTitle>
          </CardHeader>
          <CardContent>
            {options.length === 0 ? (
              <p className='text-muted-foreground py-8 text-center text-sm'>
                등록된 기수가 없습니다.
              </p>
            ) : (
              <CohortDownloads cohorts={options} />
            )}
          </CardContent>
        </Card>

        <p className='text-muted-foreground text-xs'>
          모든 다운로드는 활동 로그에 기록됩니다 · 개인정보가 포함된 자료는 열람 권한(viewer)
          계정에서 받을 수 없습니다
        </p>
      </div>
    </PageContainer>
  );
}
