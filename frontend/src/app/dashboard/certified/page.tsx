import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { fetchCertRows, filterCertRows, TRACK_LABEL, type CertRow } from '@/lib/certified-roster';
import { CertifiedTable, type FilterOption } from './_components/certified-table';

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v.trim() : '');

const countBy = (rows: CertRow[], fn: (r: CertRow) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(fn(r), (m.get(fn(r)) ?? 0) + 1);
  return m;
};

const toOptions = (m: Map<string, number>, label?: (v: string) => string): FilterOption[] =>
  [...m.entries()].map(([value, count]) => ({ value, label: label?.(value) ?? value, count }));

export default async function CertifiedPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = str(sp.q);
  const year = str(sp.year);
  const track = str(sp.track);
  const kind = str(sp.kind);

  const all = await fetchCertRows();

  // 요약 통계 (필터 무관, 전체 기준)
  const uniquePeople = new Set(all.map((r) => r.applicantId)).size;
  const yearTrackCounts = new Map<string, number>();
  for (const r of all) {
    const key = `${r.year} ${TRACK_LABEL[r.track] ?? r.track}`;
    yearTrackCounts.set(key, (yearTrackCounts.get(key) ?? 0) + 1);
  }

  const yearOptions = toOptions(countBy(all, (r) => String(r.year))).toSorted((a, b) =>
    b.value.localeCompare(a.value)
  );
  const trackOptions = toOptions(
    countBy(all, (r) => r.track),
    (v) => TRACK_LABEL[v as CertRow['track']] ?? v
  );
  const kindOptions = toOptions(countBy(all, (r) => r.kind)).toSorted((a, b) => b.count - a.count);

  // 필터 + 검색 + 페이지네이션
  const filtered = filterCertRows(all, { q, year, track, kind });
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // 화면·클라이언트로는 PII(연락처·이메일) 미전달 — 엑셀 export에만 포함
  const rows = slice.map((r) => ({
    key: `${r.certNo}::${r.applicantId}`,
    applicantId: r.applicantId,
    name: r.name,
    organization: r.organization,
    department: r.department,
    jobTitle: r.jobTitle,
    year: r.year,
    track: r.track,
    round: r.round,
    kind: r.kind,
    certNo: r.certNo
  }));

  const exportParams = new URLSearchParams();
  if (q) exportParams.set('q', q);
  if (year) exportParams.set('year', year);
  if (track) exportParams.set('track', track);
  if (kind) exportParams.set('kind', kind);
  const exportHref = `/api/certified/export${exportParams.size ? `?${exportParams}` : ''}`;

  return (
    <PageContainer
      pageTitle='인증자'
      pageDescription='AI챔피언 공식 인증자 통합 명단 (연도 무관 전체)'
      pageHeaderAction={
        <Button asChild variant='outline'>
          <a href={exportHref}>
            <Icons.download className='mr-1.5' />
            엑셀 다운로드
          </a>
        </Button>
      }
    >
      <div className='flex flex-col gap-6'>
        <Card className='py-4'>
          <CardContent className='flex flex-wrap items-center gap-x-10 gap-y-3 px-6'>
            <Stat label='전체 인증 건수' value={all.length} />
            <Stat label='인증자 수 (중복 제외)' value={uniquePeople} />
            {[...yearTrackCounts.entries()].map(([label, count]) => (
              <Stat key={label} label={label} value={count} />
            ))}
          </CardContent>
        </Card>

        <CertifiedTable
          rows={rows}
          page={safePage}
          pageSize={PAGE_SIZE}
          pageCount={pageCount}
          totalCount={total}
          search={q}
          yearFilter={year}
          trackFilter={track}
          kindFilter={kind}
          yearOptions={yearOptions}
          trackOptions={trackOptions}
          kindOptions={kindOptions}
        />
      </div>
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className='flex flex-col'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className='text-lg leading-tight font-semibold tabular-nums'>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
