import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ApplicantsTable, type ApplicationRow } from './_components/applicants-table';
import { ResetSelectionButton } from './_components/reset-selection-button';
import { SelectionSheet } from './_components/selection-sheet';
import { UploadDialog } from './_components/upload-dialog';
import { APPLICATIONS_PAGE_SIZE, applicationsSearchParamsCache } from './_search-params';
import type { AppQuestion } from '@/lib/applications-xls-parser';

type Props = {
  params: Promise<{ cohortId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CohortApplicationsPage({ params, searchParams }: Props) {
  const { cohortId } = await params;
  const { page, q, category, status, sort } = applicationsSearchParamsCache.parse(
    await searchParams
  );
  const supabase = createAdminClient();
  const pageSize = APPLICATIONS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = q.trim();
  const categoryFilter = category.trim();
  const statusFilter = status.trim();

  // 정렬 파싱: "column:direction" — column 화이트리스트
  const SORTABLE_COLUMNS: Record<string, { column: string; referencedTable?: string }> = {
    status: { column: 'status' },
    name: { column: 'name', referencedTable: 'applicants' },
    knowledge_score: { column: 'knowledge_score' },
    applied_at: { column: 'applied_at' }
  };
  const [sortColRaw = 'applied_at', sortDirRaw = 'desc'] = sort.split(':');
  const sortSpec = SORTABLE_COLUMNS[sortColRaw] ?? SORTABLE_COLUMNS.applied_at;
  const sortAsc = sortDirRaw === 'asc';

  type ApplicationQuery = {
    id: string;
    status: string;
    rejected_stage: string | null;
    applied_at: string | null;
    decided_at: string | null;
    knowledge_score: number | null;
    knowledge_correct_count: number | null;
    knowledge_total_count: number | null;
    self_diagnosis_avg: number | null;
    applicants: {
      id: string;
      name: string;
      department: string | null;
      job_role: string | null;
      organizations: { name: string } | null;
    } | null;
  };

  type StatsRowQ = {
    id: string;
    status: string;
    knowledge_score: number | null;
    self_diagnosis_avg: number | null;
  };

  // 1단계: 코호트 전체의 status·questions·C2 응답 (facet count + 필터링용)
  const [{ data: cohort }, { data: questions }, { data: statsRows }] = await Promise.all([
    supabase
      .from('cohorts')
      .select('id, name, max_capacity')
      .eq('id', cohortId)
      .maybeSingle(),
    supabase
      .from('application_questions')
      .select('id, question_no, question_type, section, choices, correct_choice')
      .eq('cohort_id', cohortId)
      .order('display_order', { ascending: true })
      .returns<AppQuestion[]>(),
    supabase
      .from('applications')
      .select('id, status, knowledge_score, self_diagnosis_avg')
      .eq('cohort_id', cohortId)
      .returns<StatsRowQ[]>()
  ]);
  const questionCount = questions?.length ?? 0;
  const finalQuestion = questions?.find((q) => q.question_no === 'Plan') ?? null;
  const c2Question = questions?.find((q) => q.question_no === 'C2') ?? null;
  const allAppIds = (statsRows ?? []).map((r) => r.id);

  // C2 응답을 코호트 전체에 대해 fetch (facet + 필터링)
  const c2ChoiceMap = new Map<string, string>();
  if (c2Question && allAppIds.length > 0) {
    const { data: c2Answers } = await supabase
      .from('application_answers')
      .select('application_id, answer_value')
      .eq('question_id', c2Question.id)
      .in('application_id', allAppIds);
    for (const a of c2Answers ?? []) {
      const key = typeof a.answer_value === 'string' ? a.answer_value : null;
      if (key) c2ChoiceMap.set(a.application_id, key);
    }
  }

  // 검색·필터 적용해 application_id 집합 좁힘
  let applicantIdFilter: string[] | null = null;
  if (search) {
    const { data: matchedApplicants } = await supabase
      .from('applicants')
      .select('id')
      .or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    applicantIdFilter = (matchedApplicants ?? []).map((a) => a.id);
  }

  const CATEGORY_TO_C2: Record<string, string> = {
    central: '①',
    metro_local: '②',
    basic_local: '③',
    public: '④',
    education: '⑤',
    other: '⑥'
  };
  let categoryFilteredAppIds: string[] | null = null;
  if (categoryFilter && CATEGORY_TO_C2[categoryFilter]) {
    const target = CATEGORY_TO_C2[categoryFilter];
    categoryFilteredAppIds = [...c2ChoiceMap.entries()]
      .filter(([, k]) => k === target)
      .map(([id]) => id);
  }

  let rowsQuery = supabase
    .from('applications')
    .select(
      'id, status, rejected_stage, applied_at, decided_at, knowledge_score, knowledge_correct_count, knowledge_total_count, self_diagnosis_avg, applicants(id, name, department, job_role, organizations(name))',
      { count: 'exact' }
    )
    .eq('cohort_id', cohortId)
    .order(sortSpec.column, {
      ascending: sortAsc,
      nullsFirst: false,
      ...(sortSpec.referencedTable ? { referencedTable: sortSpec.referencedTable } : {})
    })
    .range(from, to);

  if (applicantIdFilter !== null) {
    rowsQuery =
      applicantIdFilter.length > 0
        ? rowsQuery.in('applicant_id', applicantIdFilter)
        : rowsQuery.in('applicant_id', ['__none__']);
  }
  if (statusFilter) rowsQuery = rowsQuery.eq('status', statusFilter);
  if (categoryFilteredAppIds !== null) {
    rowsQuery =
      categoryFilteredAppIds.length > 0
        ? rowsQuery.in('id', categoryFilteredAppIds)
        : rowsQuery.in('id', ['__none__']);
  }

  const { data: applications, count: totalCount } = await rowsQuery.returns<ApplicationQuery[]>();

  // 페이지 내 마지막 문항(Plan) 글자수
  const pageAppIds = (applications ?? []).map((a) => a.id);
  const planCharMap = new Map<string, number>();
  if (finalQuestion && pageAppIds.length > 0) {
    const { data: finalAnswers } = await supabase
      .from('application_answers')
      .select('application_id, answer_value')
      .eq('question_id', finalQuestion.id)
      .in('application_id', pageAppIds);
    for (const a of finalAnswers ?? []) {
      const text = typeof a.answer_value === 'string' ? a.answer_value : '';
      planCharMap.set(a.application_id, text.replace(/\s+/g, '').length);
    }
  }

  // facet counts (필터 적용 전 코호트 전체 기준)
  const categoryCounts: Record<string, number> = {
    central: 0,
    metro_local: 0,
    basic_local: 0,
    public: 0,
    education: 0,
    other: 0
  };
  const C2_TO_CATEGORY: Record<string, string> = {
    '①': 'central',
    '②': 'metro_local',
    '③': 'basic_local',
    '④': 'public',
    '⑤': 'education',
    '⑥': 'other'
  };
  for (const k of c2ChoiceMap.values()) {
    const cat = C2_TO_CATEGORY[k];
    if (cat) categoryCounts[cat]++;
  }
  const statusCounts: Record<string, number> = {
    applied: 0,
    pending: 0,
    selected: 0,
    rejected: 0,
    withdrawn: 0
  };
  for (const r of statsRows ?? []) {
    if (r.status in statusCounts) statusCounts[r.status]++;
  }

  const rows: ApplicationRow[] = (applications ?? []).map((a) => ({
    id: a.id,
    applicant_id: a.applicants?.id ?? '',
    name: a.applicants?.name ?? '(이름 없음)',
    organization: a.applicants?.organizations?.name ?? null,
    c2_choice: c2ChoiceMap.get(a.id) ?? null,
    status: a.status,
    rejected_stage: a.rejected_stage,
    knowledge_score: a.knowledge_score,
    knowledge_correct_count: a.knowledge_correct_count,
    knowledge_total_count: a.knowledge_total_count,
    plan_char_count: planCharMap.get(a.id) ?? null,
    applied_at: a.applied_at
  }));

  const hasQuestions = questionCount > 0;

  // 통계는 cohort 전체 기준 (검색·페이지 무관)
  const allRows = statsRows ?? [];
  const knowledgeRows = allRows.filter((r) => r.knowledge_score !== null);
  const selfDiagRows = allRows.filter((r) => r.self_diagnosis_avg !== null);
  const stats = {
    total: allRows.length,
    selected: allRows.filter((r) => r.status === 'selected').length,
    rejected: allRows.filter((r) => r.status === 'rejected').length,
    pending: allRows.filter((r) => r.status === 'applied' || r.status === 'pending').length,
    avgKnowledge:
      knowledgeRows.length > 0
        ? Math.round(
            (knowledgeRows.reduce((s, r) => s + (r.knowledge_score ?? 0), 0) /
              knowledgeRows.length) *
              10
          ) / 10
        : null,
    avgSelfDiag:
      selfDiagRows.length > 0
        ? Math.round(
            (selfDiagRows.reduce((s, r) => s + (r.self_diagnosis_avg ?? 0), 0) /
              selfDiagRows.length) *
              10
          ) / 10
        : null
  };

  const filteredTotal = totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(filteredTotal / pageSize));

  const headerAction = (
    <div className='flex items-center gap-2'>
      <Button variant='outline' size='sm' asChild disabled={!hasQuestions}>
        <Link href={`/dashboard/cohorts/${cohortId}/applications/questions`}>
          <Icons.forms className='mr-1.5' />
          사전문항 미리보기
        </Link>
      </Button>
      <ResetSelectionButton cohortId={cohortId} disabled={stats.total === 0} />
      <SelectionSheet
        cohortId={cohortId}
        defaultCapacity={cohort?.max_capacity ?? 24}
        trigger={
          <Button variant='outline' size='sm' disabled={stats.total === 0}>
            <Icons.sparkles className='mr-1.5' />
            자동 선발
          </Button>
        }
      />
      <UploadDialog
        cohortId={cohortId}
        questions={questions ?? []}
        trigger={
          <Button size='sm' disabled={!hasQuestions}>
            <Icons.upload className='mr-1.5' />
            응답 엑셀 업로드
          </Button>
        }
      />
    </div>
  );

  return (
    <PageContainer
      pageTitle='신청·응답'
      pageDescription={cohort?.name ?? ''}
      pageHeaderAction={headerAction}
    >
      <div className='flex flex-col gap-6'>
        <StatsRow stats={stats} questionCount={questionCount} />
        {stats.total === 0 ? (
          <EmptyState hasQuestions={hasQuestions} cohortId={cohortId} questions={questions ?? []} />
        ) : (
          <ApplicantsTable
            rows={rows}
            cohortId={cohortId}
            page={page}
            pageSize={pageSize}
            pageCount={pageCount}
            totalCount={filteredTotal}
            categoryCounts={categoryCounts}
            statusCounts={statusCounts}
          />
        )}
      </div>
    </PageContainer>
  );
}

function StatsRow({
  stats,
  questionCount
}: {
  stats: {
    total: number;
    selected: number;
    rejected: number;
    pending: number;
    avgKnowledge: number | null;
    avgSelfDiag: number | null;
  };
  questionCount: number;
}) {
  return (
    <Card className='py-4'>
      <CardContent className='flex flex-wrap items-center gap-x-10 gap-y-3 px-6'>
        <Stat label='총 신청자' value={stats.total} accent />
        <Stat label='선발' value={stats.selected} tone='text-emerald-600' />
        <Stat label='탈락' value={stats.rejected} tone='text-rose-600' />
        <Stat label='미결정' value={stats.pending} tone='text-amber-600' />
        <Stat
          label='평균 지식점수'
          value={stats.avgKnowledge !== null ? `${stats.avgKnowledge}점` : '—'}
        />
        <Stat
          label='평균 자가진단'
          value={stats.avgSelfDiag !== null ? `${stats.avgSelfDiag} / 5` : '—'}
        />
        <Stat label='등록된 문항' value={`${questionCount}개`} tone='text-muted-foreground' />
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
  tone
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  tone?: string;
}) {
  const valueClass = accent ? 'text-primary' : (tone ?? 'text-foreground');
  return (
    <div className='flex flex-col'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className={`text-lg leading-tight font-semibold tabular-nums ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({
  hasQuestions,
  cohortId,
  questions
}: {
  hasQuestions: boolean;
  cohortId: string;
  questions: AppQuestion[];
}) {
  return (
    <Card>
      <CardContent className='flex flex-col items-center gap-4 py-16 px-6 text-center'>
        <div className='bg-muted text-muted-foreground flex h-14 w-14 items-center justify-center rounded-full'>
          <Icons.teams className='size-7' />
        </div>
        <div>
          <p className='text-base font-medium'>아직 신청자가 없습니다</p>
          <p className='text-muted-foreground mt-1 text-sm'>
            {hasQuestions
              ? '외부 신청 시스템에서 받은 응답 엑셀을 업로드하면 여기에 표시됩니다.'
              : '먼저 사전문항을 시드한 후 응답을 업로드하세요.'}
          </p>
        </div>
        <div className='flex gap-2'>
          <UploadDialog
            cohortId={cohortId}
            questions={questions}
            trigger={
              <Button variant='outline' size='sm' disabled={!hasQuestions}>
                응답 엑셀 업로드
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
