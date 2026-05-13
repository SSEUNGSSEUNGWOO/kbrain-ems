import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { classifyOrganization, type OrganizationCategory } from '@/lib/organization-category';
import { ApplicantSheet } from './_components/applicant-sheet';
import { ApplicantTable, type CategoryCounts } from './_components/applicant-table';
import { APPLICANTS_PAGE_SIZE, applicantsSearchParamsCache } from './_search-params';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ApplicantsPage({ searchParams }: Props) {
  try {
    const { page, q, category } = applicantsSearchParamsCache.parse(await searchParams);
    const supabase = createAdminClient();
    const pageSize = APPLICANTS_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const search = q.trim();
    const categoryFilter = (category || null) as OrganizationCategory | null;

    type ApplicantRow = {
      id: string;
      name: string;
      department: string | null;
      job_title: string | null;
      job_role: string | null;
      birth_date: string | null;
      email: string | null;
      phone: string | null;
      notes: string | null;
      organizations: { name: string } | null;
    };

    // 카테고리 필터 적용 시: classifyOrganization으로 분류해서 매칭되는 organization id list 추출
    let orgIdFilter: string[] | null = null;
    if (categoryFilter) {
      const { data: orgs } = await supabase.from('organizations').select('id, name');
      orgIdFilter = (orgs ?? [])
        .filter((o) => classifyOrganization(o.name) === categoryFilter)
        .map((o) => o.id);
    }

    let rowsQuery = supabase
      .from('applicants')
      .select(
        'id, name, department, job_title, job_role, birth_date, email, phone, notes, organizations(name)',
        { count: 'exact' }
      )
      .order('name', { ascending: true })
      .range(from, to);

    if (search) {
      rowsQuery = rowsQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    if (orgIdFilter !== null) {
      rowsQuery =
        orgIdFilter.length > 0
          ? rowsQuery.in('organization_id', orgIdFilter)
          : rowsQuery.in('organization_id', ['__none__']);
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
      organizationCategory: null as string | null,
      department: r.department,
      job_title: r.job_title,
      job_role: r.job_role,
      birth_date: r.birth_date,
      email: r.email,
      phone: r.phone,
      notes: r.notes
    }));

    // facet count: 검색은 적용, 카테고리 미적용. organization name으로 자동 분류
    let facetQuery = supabase.from('applicants').select('organizations(name)');
    if (search) {
      facetQuery = facetQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    const { data: facetRows, error: facetError } =
      await facetQuery.returns<{ organizations: { name: string } | null }[]>();
    if (facetError) throw new Error(facetError.message);

    const categoryCounts: CategoryCounts = {};
    for (const f of facetRows ?? []) {
      const key = classifyOrganization(f.organizations?.name ?? '');
      categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
    }
    const facetTotal = facetRows?.length ?? 0;

    // applications 집계: 페이지 내 applicant id만
    const pageIds = rows.map((r) => r.id);
    const countMap = new Map<string, { total: number; selected: number }>();
    if (pageIds.length > 0) {
      const { data: applicationRows, error: applicationError } = await supabase
        .from('applications')
        .select('applicant_id, status')
        .in('applicant_id', pageIds);
      if (applicationError) throw new Error(applicationError.message);

      for (const a of applicationRows ?? []) {
        const entry = countMap.get(a.applicant_id) ?? { total: 0, selected: 0 };
        entry.total++;
        if (a.status === 'selected') entry.selected++;
        countMap.set(a.applicant_id, entry);
      }
    }

    const mapped = rows.map((r) => ({
      ...r,
      applicationCount: countMap.get(r.id)?.total ?? 0,
      selectedCount: countMap.get(r.id)?.selected ?? 0
    }));

    const total = totalCount ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const hasFilter = Boolean(search || category);

    return (
      <PageContainer
        pageTitle='지원자 관리'
        pageDescription={hasFilter ? `필터 결과 ${total}명` : `총 ${total}명`}
        pageHeaderAction={<ApplicantSheet trigger={<Button>+ 지원자 추가</Button>} />}
      >
        <ApplicantTable
          applicants={mapped}
          page={page}
          pageSize={pageSize}
          pageCount={pageCount}
          totalCount={total}
          categoryCounts={categoryCounts}
          facetTotal={facetTotal}
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
