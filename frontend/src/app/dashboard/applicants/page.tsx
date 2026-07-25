import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { ApplicantSheet } from './_components/applicant-sheet';
import { ApplicantTable, type CategoryCounts } from './_components/applicant-table';
import {
  APPLICANTS_PAGE_SIZE,
  applicantsSearchParamsCache,
  type ApplicantSort
} from './_search-params';

const sanitizeSearch = (s: string) =>
  s.replace(/[%,()\\]/g, ' ').replace(/\s+/g, ' ').trim();

const CATEGORY_KEYS = [
  '중앙부처',
  '광역지자체',
  '기초지자체',
  '공공기관',
  '교육행정기관',
  '기타'
] as const;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type RpcRow = {
  id: string;
  name: string;
  category: string | null;
  department: string | null;
  job_title: string | null;
  job_role: string | null;
  birth_date: string | null;
  email: string | null;
  personal_email: string | null;
  phone: string | null;
  notes: string | null;
  organizationName: string | null;
  applicationCount: number;
  selectedCount: number;
  rejectedCount: number;
  appliedCohorts: string[];
  selectedCohorts: string[];
  rejectedCohorts: string[];
};

type RpcResult = {
  rows: RpcRow[];
  total: number;
  categoryCounts: Record<string, number>;
  facetTotal: number;
};

export default async function ApplicantsPage({ searchParams }: Props) {
  try {
    const { page, q, category, unselected, sort } = applicantsSearchParamsCache.parse(
      await searchParams
    );
    const supabase = createAdminClient();
    const hidePersonal = await isViewer();
    const pageSize = APPLICANTS_PAGE_SIZE;
    const search = sanitizeSearch(q.trim());
    const sortKey: ApplicantSort = sort;

    // @ts-expect-error supabase types.ts에 search_applicants RPC 미등록 — 마이그레이션 적용 후 types regen 필요
    const { data, error } = await supabase.rpc('search_applicants', {
      p_search: search || null,
      p_category: category || null,
      p_unselected_only: unselected === '1',
      p_sort: sortKey,
      p_page: page,
      p_page_size: pageSize,
      p_hide_personal: hidePersonal
    });
    if (error) throw new Error(error.message);

    const result = (data ?? {
      rows: [],
      total: 0,
      categoryCounts: {},
      facetTotal: 0
    }) as RpcResult;

    const total = result.total;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const categoryCounts: CategoryCounts = result.categoryCounts ?? {};
    const facetTotal = result.facetTotal;
    const hasFilter = Boolean(search || category || unselected === '1');

    return (
      <PageContainer
        pageTitle='지원자 관리'
        pageDescription={hasFilter ? `필터 결과 ${total}명` : `총 ${total}명`}
        pageHeaderAction={
          hidePersonal ? null : <ApplicantSheet trigger={<Button>+ 지원자 추가</Button>} />
        }
      >
        <ApplicantTable
          applicants={result.rows}
          page={page}
          pageSize={pageSize}
          pageCount={pageCount}
          totalCount={total}
          categoryCounts={categoryCounts}
          categoryKeys={[...CATEGORY_KEYS, '미분류']}
          facetTotal={facetTotal}
          hidePersonal={hidePersonal}
          unselectedOnly={unselected === '1'}
          sort={sortKey}
        />
      </PageContainer>
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    return (
      <PageContainer pageTitle='지원자 관리'>
        <div className='text-destructive'>불러오기 실패: {message}</div>
      </PageContainer>
    );
  }
}
