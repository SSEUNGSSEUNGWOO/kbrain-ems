import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { ApplicantSheet } from './_components/applicant-sheet';
import { ApplicantTable, type CategoryCounts } from './_components/applicant-table';
import { APPLICANTS_PAGE_SIZE, applicantsSearchParamsCache } from './_search-params';

// 분류는 신청자가 직접 고른 C2 응답(applicants.category)을 그대로 사용.
// 6개 값 + NULL(미응답/수동 추가) = '미분류'
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

export default async function ApplicantsPage({ searchParams }: Props) {
  try {
    const { page, q, category } = applicantsSearchParamsCache.parse(await searchParams);
    const supabase = createAdminClient();
    const hidePersonal = await isViewer();
    const pageSize = APPLICANTS_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    // PostgREST or 필터에서 ,/)/%/(/\\ 가 특수문자로 해석되므로 검색어에서 제거.
    // % 는 와일드카드라 사용자가 그대로 입력해도 검색 의도 표현 X.
    const sanitizeSearch = (s: string) => s.replace(/[%,()\\]/g, ' ').replace(/\s+/g, ' ').trim();
    const search = sanitizeSearch(q.trim());
    const categoryFilter = category || null;

    type ApplicantRow = {
      id: string;
      name: string;
      category: string | null;
      department: string | null;
      job_title: string | null;
      job_role: string | null;
      birth_date: string | null;
      email?: string | null;
      personal_email?: string | null;
      phone?: string | null;
      notes: string | null;
      organizations: { name: string } | null;
    };

    // viewer는 phone/email 네트워크 응답에서도 제외 (서버 select 단계에서 빼기)
    const selectCols = hidePersonal
      ? 'id, name, category, department, job_title, job_role, birth_date, notes, organizations(name)'
      : 'id, name, category, department, job_title, job_role, birth_date, email, personal_email, phone, notes, organizations(name)';

    let rowsQuery = supabase
      .from('applicants')
      .select(selectCols, { count: 'exact' })
      .order('name', { ascending: true })
      .range(from, to);

    if (search) {
      // viewer는 phone 검색 불가, 이름만
      rowsQuery = hidePersonal
        ? rowsQuery.ilike('name', `%${search}%`)
        : rowsQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    if (categoryFilter) {
      if (categoryFilter === '미분류') {
        rowsQuery = rowsQuery.is('category', null);
      } else {
        // @ts-expect-error supabase types.ts에 applicants.category 미반영 (마이그레이션 후 regen)
        rowsQuery = rowsQuery.eq('category', categoryFilter);
      }
    }

    const {
      data: applicantRows,
      count: totalCount,
      error: applicantError
    } = await rowsQuery.returns<ApplicantRow[]>();
    if (applicantError) throw new Error(applicantError.message);

    const rows = (applicantRows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      organizationName: r.organizations?.name ?? null,
      category: r.category,
      department: r.department,
      job_title: r.job_title,
      job_role: r.job_role,
      birth_date: r.birth_date,
      email: r.email ?? null,
      personal_email: r.personal_email ?? null,
      phone: r.phone ?? null,
      notes: r.notes
    }));

    // facet count: 검색만 적용, 카테고리 미적용. applicants.category 직접 그룹화
    let facetQuery = supabase.from('applicants').select('category');
    if (search) {
      facetQuery = hidePersonal
        ? facetQuery.ilike('name', `%${search}%`)
        : facetQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    // Supabase JS 기본 limit 1000 → applicants 2000+ row 일 때 facet 통계가 잘림.
    // 충분히 큰 range 로 풀 사이즈 받아 카테고리 정확히 집계.
    const { data: facetRows, error: facetError } = await facetQuery
      .range(0, 49999)
      .returns<{ category: string | null }[]>();
    if (facetError) throw new Error(facetError.message);

    const categoryCounts: CategoryCounts = {};
    for (const f of facetRows ?? []) {
      const key = f.category ?? '미분류';
      categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
    }
    const facetTotal = facetRows?.length ?? 0;

    // applications 집계: 페이지 내 applicant id만 + cohort 이름까지 join (tooltip용)
    const pageIds = rows.map((r) => r.id);
    type AppJoin = {
      applicant_id: string;
      status: string;
      cohorts: { name: string } | null;
    };
    const cohortMap = new Map<string, { applied: string[]; selected: string[] }>();
    if (pageIds.length > 0) {
      const { data: applicationRows, error: applicationError } = await supabase
        .from('applications')
        .select('applicant_id, status, cohorts(name)')
        .in('applicant_id', pageIds)
        .returns<AppJoin[]>();
      if (applicationError) throw new Error(applicationError.message);

      for (const a of applicationRows ?? []) {
        const entry = cohortMap.get(a.applicant_id) ?? { applied: [], selected: [] };
        const cName = a.cohorts?.name ?? '(이름 없음)';
        entry.applied.push(cName);
        if (a.status === 'selected') entry.selected.push(cName);
        cohortMap.set(a.applicant_id, entry);
      }
    }

    const mapped = rows.map((r) => {
      const entry = cohortMap.get(r.id) ?? { applied: [], selected: [] };
      return {
        ...r,
        applicationCount: entry.applied.length,
        selectedCount: entry.selected.length,
        appliedCohorts: entry.applied,
        selectedCohorts: entry.selected
      };
    });

    const total = totalCount ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const hasFilter = Boolean(search || category);

    return (
      <PageContainer
        pageTitle='지원자 관리'
        pageDescription={hasFilter ? `필터 결과 ${total}명` : `총 ${total}명`}
        pageHeaderAction={
          hidePersonal ? null : <ApplicantSheet trigger={<Button>+ 지원자 추가</Button>} />
        }
      >
        <ApplicantTable
          applicants={mapped}
          page={page}
          pageSize={pageSize}
          pageCount={pageCount}
          totalCount={total}
          categoryCounts={categoryCounts}
          categoryKeys={[...CATEGORY_KEYS, '미분류']}
          facetTotal={facetTotal}
          hidePersonal={hidePersonal}
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
