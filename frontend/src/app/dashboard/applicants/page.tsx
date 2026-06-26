import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllPages } from '@/lib/supabase/fetch-all';
import { isViewer } from '@/lib/auth';
import { isTestStudent } from '@/lib/students';
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
const cmpName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'ko');

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
    const { page, q, category, unselected, sort } = applicantsSearchParamsCache.parse(
      await searchParams
    );
    const supabase = createAdminClient();
    const hidePersonal = await isViewer();
    const pageSize = APPLICANTS_PAGE_SIZE;
    const search = sanitizeSearch(q.trim());
    const categoryFilter = category || null;
    const unselectedOnly = unselected === '1';
    const sortKey: ApplicantSort = sort;

    // ---------- 1. applications 전체 집계 — applicant_id 별 count & cohort 이름 ----------
    type AppJoin = {
      applicant_id: string;
      status: string;
      cohorts: { name: string } | null;
    };
    const appAggRows = await fetchAllPages<AppJoin>((from, to) =>
      supabase
        .from('applications')
        .select('applicant_id, status, cohorts(name)')
        .range(from, to)
        .returns<AppJoin[]>()
    );

    type Stats = {
      applied: string[];
      selected: string[];
      rejected: string[];
    };
    const statsByApplicant = new Map<string, Stats>();
    for (const a of appAggRows) {
      const entry = statsByApplicant.get(a.applicant_id) ?? {
        applied: [],
        selected: [],
        rejected: []
      };
      const cName = a.cohorts?.name ?? '(이름 없음)';
      entry.applied.push(cName);
      if (a.status === 'selected') entry.selected.push(cName);
      else if (a.status === 'rejected') entry.rejected.push(cName);
      statsByApplicant.set(a.applicant_id, entry);
    }

    // ---------- 2. applicants 전체 (검색·카테고리 필터 적용) ----------
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

    const selectCols = hidePersonal
      ? 'id, name, category, department, job_title, job_role, birth_date, notes, organizations(name)'
      : 'id, name, category, department, job_title, job_role, birth_date, email, personal_email, phone, notes, organizations(name)';

    const applicantRows = await fetchAllPages<ApplicantRow>((from, to) => {
      let q = supabase.from('applicants').select(selectCols).range(from, to);
      if (search) {
        q = hidePersonal
          ? q.ilike('name', `%${search}%`)
          : q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      }
      if (categoryFilter) {
        if (categoryFilter === '미분류') {
          q = q.is('category', null);
        } else {
          // @ts-expect-error supabase types.ts에 applicants.category 미반영
          q = q.eq('category', categoryFilter);
        }
      }
      return q.returns<ApplicantRow[]>();
    });

    // 테스트 학생(이름 "테스트" 시작) 제외 + 지원 이력 0건 제외
    // (마스터에만 등록된 2025 인증자 roster 등은 "지원자 관리" 의미에 안 맞음)
    const realApplicants = applicantRows.filter(
      (r) => !isTestStudent(r.name) && statsByApplicant.has(r.id)
    );

    // ---------- 3. merge stats + filter unselected + sort + slice ----------
    const merged = realApplicants.map((r) => {
      const s = statsByApplicant.get(r.id) ?? { applied: [], selected: [], rejected: [] };
      return {
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
        notes: r.notes,
        applicationCount: s.applied.length,
        selectedCount: s.selected.length,
        rejectedCount: s.rejected.length,
        appliedCohorts: s.applied,
        selectedCohorts: s.selected,
        rejectedCohorts: s.rejected
      };
    });

    const filtered = unselectedOnly
      ? merged.filter((r) => r.applicationCount >= 1 && r.selectedCount === 0)
      : merged;

    const sorted = filtered.toSorted((a, b) => {
      switch (sortKey) {
        case 'app_desc':
          return b.applicationCount - a.applicationCount || cmpName(a, b);
        case 'app_asc':
          return a.applicationCount - b.applicationCount || cmpName(a, b);
        case 'selected_desc':
          return b.selectedCount - a.selectedCount || cmpName(a, b);
        case 'selected_asc':
          return a.selectedCount - b.selectedCount || cmpName(a, b);
        case 'rejected_desc':
          return b.rejectedCount - a.rejectedCount || cmpName(a, b);
        case 'rejected_asc':
          return a.rejectedCount - b.rejectedCount || cmpName(a, b);
        default:
          return cmpName(a, b);
      }
    });

    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const from = (page - 1) * pageSize;
    const mapped = sorted.slice(from, from + pageSize);

    // ---------- 4. facet count (카테고리) — 검색만 적용, 테스트 + 지원 0건 제외 ----------
    type FacetRow = { id: string; name: string; category: string | null };
    const facetRows = await fetchAllPages<FacetRow>((from, to) => {
      let q = supabase.from('applicants').select('id, name, category').range(from, to);
      if (search) {
        q = hidePersonal
          ? q.ilike('name', `%${search}%`)
          : q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      }
      return q.returns<FacetRow[]>();
    });

    const realFacetRows = facetRows.filter(
      (f) => !isTestStudent(f.name) && statsByApplicant.has(f.id)
    );
    const categoryCounts: CategoryCounts = {};
    for (const f of realFacetRows) {
      const key = f.category ?? '미분류';
      categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
    }
    const facetTotal = realFacetRows.length;

    const hasFilter = Boolean(search || category || unselectedOnly);

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
          unselectedOnly={unselectedOnly}
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
