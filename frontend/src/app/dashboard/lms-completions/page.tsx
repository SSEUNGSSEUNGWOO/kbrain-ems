import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createAdminClient } from '@/lib/supabase/server';
import { Icons } from '@/components/icons';
import { LmsImportDialog } from './_components/lms-import-dialog';
import { LmsCompletionsTable } from './_components/lms-completions-table';

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LmsCompletionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const search = (typeof sp.q === 'string' ? sp.q : '').trim();
  const courseFilter = (typeof sp.course === 'string' ? sp.course : '').trim();

  const supabase = createAdminClient();

  type LmsRow = {
    course_code: string;
    course_name: string;
    name: string;
    phone: string | null;
    email: string | null;
    completed_at: string | null;
    certificate_no: string | null;
    updated_at: string;
  };

  // 전체 fetch (PostgREST max-rows=1000 우회: range chunked)
  const lmsAll: LmsRow[] = [];
  const chunk = 1000;
  for (let from = 0; from < 1_000_000; from += chunk) {
    const res = (await supabase
      // @ts-expect-error lms_completions type 미반영
      .from('lms_completions')
      .select(
        'course_code, course_name, name, phone, email, completed_at, certificate_no, updated_at'
      )
      .range(from, from + chunk - 1)) as unknown as { data: LmsRow[] | null };
    const batch = res.data ?? [];
    lmsAll.push(...batch);
    if (batch.length < chunk) break;
  }

  // 과목별 통계 (필터링 무관, 전체 기준)
  const courseCounts = new Map<string, { name: string; count: number }>();
  for (const r of lmsAll) {
    const e = courseCounts.get(r.course_code);
    if (e) e.count++;
    else courseCounts.set(r.course_code, { name: r.course_name, count: 1 });
  }
  const lastUpdated = lmsAll.reduce<string | null>(
    (acc, r) => (acc && acc > r.updated_at ? acc : r.updated_at),
    null
  );
  const courseOptions = [...courseCounts.entries()]
    .map(([code, info]) => ({ code, name: info.name, count: info.count }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // 필터 + 검색
  let filtered = lmsAll;
  if (courseFilter) filtered = filtered.filter((r) => r.course_code === courseFilter);
  if (search) {
    const q = search.toLowerCase();
    const qDigits = q.replace(/[^\d]/g, '');
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (qDigits && (r.phone ?? '').replace(/[^\d]/g, '').includes(qDigits)) ||
        (r.email ?? '').toLowerCase().includes(q)
    );
  }

  // 정렬 — 최근 수료일순
  filtered.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  // 페이지네이션
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const rows = slice.map((r, idx) => ({
    key: `${r.course_code}::${r.certificate_no ?? `${(safePage - 1) * PAGE_SIZE + idx}`}`,
    name: r.name,
    phone: r.phone,
    email: r.email,
    courseCode: r.course_code,
    courseName: r.course_name,
    completedAt: r.completed_at,
    certificateNo: r.certificate_no
  }));

  return (
    <PageContainer
      pageTitle='사전학습 명단'
      pageDescription='LMS 수료자 명단'
      pageHeaderAction={
        <LmsImportDialog
          trigger={
            <Button>
              <Icons.upload className='mr-1.5' />
              명단 업로드
            </Button>
          }
        />
      }
    >
      <div className='flex flex-col gap-6'>
        <Card className='py-4'>
          <CardContent className='flex flex-wrap items-center gap-x-10 gap-y-3 px-6'>
            <Stat label='전체 수료 row' value={lmsAll.length} />
            {courseOptions.map((c) => (
              <Stat key={c.code} label={c.name} value={c.count} />
            ))}
            <Stat
              label='마지막 갱신'
              value={lastUpdated ? new Date(lastUpdated).toLocaleString('ko-KR') : '—'}
              small
            />
          </CardContent>
        </Card>

        <LmsCompletionsTable
          rows={rows}
          page={safePage}
          pageSize={PAGE_SIZE}
          pageCount={pageCount}
          totalCount={total}
          search={search}
          courseFilter={courseFilter}
          courseOptions={courseOptions}
        />
      </div>
    </PageContainer>
  );
}

function Stat({
  label,
  value,
  tone,
  small
}: {
  label: string;
  value: number | string;
  tone?: string;
  small?: boolean;
}) {
  return (
    <div className='flex flex-col'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span
        className={`font-semibold tabular-nums ${small ? 'text-sm' : 'text-lg leading-tight'} ${tone ?? 'text-foreground'}`}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  );
}
