import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import {
  getSpecialCourseHistoryByApplicant,
  type SpecialHistory
} from '@/lib/special-course-history';
import Link from 'next/link';
import { ApplicantsTable, type ApplicationRow } from './_components/applicants-table';
import { ResetSelectionButton } from './_components/reset-selection-button';
import { SelectionExportButton } from './_components/selection-export-button';
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
  const hidePersonal = await isViewer();
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
      phone: string | null;
      email: string | null;
      personal_email: string | null;
      department: string | null;
      job_title: string | null;
      job_role: string | null;
      birth_date: string | null;
      notes: string | null;
      category: string | null;
      organizations: { name: string } | null;
    } | null;
  };

  type StatsRowQ = {
    id: string;
    status: string;
    knowledge_score: number | null;
    self_diagnosis_avg: number | null;
    applicants: { category: string | null } | null;
  };

  // 1단계: 코호트 전체의 status·questions·C2 응답 (facet count + 필터링용)
  const [{ data: cohort }, { data: questions }, { data: statsRows }] = await Promise.all([
    supabase
      .from('cohorts')
      .select('id, name, max_capacity, prereq_course_codes, delivery_method')
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
      .select('id, status, knowledge_score, self_diagnosis_avg, applicants(category)')
      .eq('cohort_id', cohortId)
      .returns<StatsRowQ[]>()
  ]);
  const questionCount = questions?.length ?? 0;
  const finalQuestion = questions?.find((q) => q.question_no === 'Plan') ?? null;
  const c2Question = questions?.find((q) => q.question_no === 'C2') ?? null;
  const certQuestion = questions?.find((q) => q.question_no === 'C-CERT') ?? null;
  const allAppIds = (statsRows ?? []).map((r) => r.id);

  // C2 응답을 코호트 전체에 대해 fetch (facet + 필터링)
  // question_id가 cohort-specific이라 .in('application_id', ...) 없이도 cohort 범위 한정됨.
  // .in()으로 수백 UUID 넘기면 URL이 너무 길어져 PostgREST가 답안을 못 돌려줌 → chunked range로 분할.
  const c2ChoiceMap = new Map<string, string>();
  if (c2Question && allAppIds.length > 0) {
    const chunk = 1000;
    for (let offset = 0; offset < 1_000_000; offset += chunk) {
      const { data: c2Answers } = await supabase
        .from('application_answers')
        .select('application_id, answer_value')
        .eq('question_id', c2Question.id)
        .range(offset, offset + chunk - 1);
      for (const a of c2Answers ?? []) {
        const key = typeof a.answer_value === 'string' ? a.answer_value : null;
        if (key) c2ChoiceMap.set(a.application_id, key);
      }
      if (!c2Answers || c2Answers.length < chunk) break;
    }
  }

  const CATEGORY_TO_C2: Record<string, string> = {
    central: '①',
    metro_local: '②',
    basic_local: '③',
    public: '④',
    education: '⑤',
    other: '⑥'
  };
  const CATEGORY_TO_LABEL: Record<string, string> = {
    central: '중앙부처',
    metro_local: '광역지자체',
    basic_local: '기초지자체',
    public: '공공기관',
    education: '교육행정기관',
    other: '기타'
  };
  // 전문인재처럼 신청서 C2 문항이 없는 cohort는 운영자가 직접 applicants.category 에
  // 한글 라벨을 입력해둠 → c2 응답 없을 때 fallback 으로 사용.
  const applicantCategoryByAppId = new Map<string, string>();
  for (const r of statsRows ?? []) {
    const cat = r.applicants?.category;
    if (cat) applicantCategoryByAppId.set(r.id, cat);
  }
  const resolveCategoryKey = (appId: string): string | null => {
    const c2 = c2ChoiceMap.get(appId);
    if (c2) {
      for (const [k, v] of Object.entries(CATEGORY_TO_C2)) if (v === c2) return k;
    }
    const label = applicantCategoryByAppId.get(appId);
    if (label) {
      for (const [k, v] of Object.entries(CATEGORY_TO_LABEL)) if (v === label) return k;
    }
    return null;
  };
  let categoryFilteredAppIds: string[] | null = null;
  if (categoryFilter) {
    categoryFilteredAppIds = (statsRows ?? [])
      .map((r) => r.id)
      .filter((id) => resolveCategoryKey(id) === categoryFilter);
  }

  // 검색은 embedded resource filter로 처리.
  // 별도 applicants 쿼리 후 .in('applicant_id', [수많은 UUID])로 거르면 검색어가
  // 흔할 때 URL 길이가 PostgREST 한계를 넘어 빈 결과가 나옴 (그린처럼 큰 cohort).
  // applicants!inner + applicants.name=ilike.*pattern* 으로 한 번에 해결.
  const applicantsSelect = search
    ? 'applicants!inner(id, name, phone, email, personal_email, department, job_title, job_role, birth_date, notes, category, organizations(name))'
    : 'applicants(id, name, phone, email, personal_email, department, job_title, job_role, birth_date, notes, category, organizations(name))';

  let rowsQuery = supabase
    .from('applications')
    .select(
      `id, status, rejected_stage, applied_at, decided_at, knowledge_score, knowledge_correct_count, knowledge_total_count, self_diagnosis_avg, ${applicantsSelect}`,
      { count: 'exact' }
    )
    .eq('cohort_id', cohortId)
    .order(sortSpec.column, {
      ascending: sortAsc,
      nullsFirst: false,
      ...(sortSpec.referencedTable ? { referencedTable: sortSpec.referencedTable } : {})
    })
    .range(from, to);

  if (search) {
    if (hidePersonal) {
      rowsQuery = rowsQuery.ilike('applicants.name', `%${search}%`);
    } else {
      rowsQuery = rowsQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`, {
        foreignTable: 'applicants'
      });
    }
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

  // 자격연계형 cohort 한정: 페이지 내 신청자의 C-CERT 답변 텍스트 + 자동 분류.
  // 자유 서술이라 1~2건 오분류 가능 → 운영자는 배지로 빠르게 스캔하고
  // 애매한 케이스는 셀의 원문 텍스트(또는 hover 툴팁)로 확인.
  type CertBucket = 'none' | 'planned' | 'has';
  const classifyCert = (raw: string): CertBucket => {
    const v = raw.trim();
    if (!v) return 'none';
    const NONE_HEADS = ['없음', '미보유', '자격증 없', '해당 없', '해당없', '보유 없', '보유없'];
    for (const h of NONE_HEADS) if (v.startsWith(h)) return 'none';
    if (/^(x|X|-+|\.{2,})\s*[.,!?]?\s*$/.test(v)) return 'none';
    if (/^n\/?a$/i.test(v)) return 'none';
    if (/예정|취득\s*중|진행\s*중|준비\s*중|시험\s*예정|응시\s*예정|취득\s*예정/.test(v)) {
      return 'planned';
    }
    return 'has';
  };
  const certTextMap = new Map<string, string>();
  const certBucketMap = new Map<string, CertBucket>();
  if (certQuestion && pageAppIds.length > 0) {
    const { data: certAnswers } = await supabase
      .from('application_answers')
      .select('application_id, answer_value')
      .eq('question_id', certQuestion.id)
      .in('application_id', pageAppIds);
    for (const a of certAnswers ?? []) {
      const text = typeof a.answer_value === 'string' ? a.answer_value.trim() : '';
      if (text) certTextMap.set(a.application_id, text);
      certBucketMap.set(a.application_id, classifyCert(text));
    }
  }

  // 사전학습 수료 매칭 — cohort에 prereq 과목이 있을 때만 lms_completions 조회.
  // 페이지에 보이는 신청자(20명)의 phone/email만 in()으로 좁혀 조회한다.
  // 전체 chunked range로 lms_completions 23,000+ 행을 매번 끌어오면 카테고리 필터 클릭
  // 같은 가벼운 인터랙션에서도 수 초 지연이 생긴다 (이전 구현).
  // lms phone은 하이픈 없는 raw digits 형식이라 applicant phone을 정규화 후 in 매칭.
  const prereqCodes = (cohort?.prereq_course_codes ?? []) as string[];
  const prereqMax = prereqCodes.length;
  const phonesByCourse = new Map<string, Set<string>>();
  const emailsByCourse = new Map<string, Set<string>>();
  if (prereqMax > 0 && (applications?.length ?? 0) > 0) {
    const pagePhones = new Set<string>();
    const pageEmails = new Set<string>();
    for (const a of applications ?? []) {
      const p = (a.applicants?.phone ?? '').replace(/[^\d]/g, '');
      if (p) pagePhones.add(p);
      const e = (a.applicants?.email ?? '').trim().toLowerCase();
      if (e) pageEmails.add(e);
    }
    type LmsRow = { course_code: string; phone: string | null; email: string | null };
    const merged: LmsRow[] = [];
    if (pagePhones.size > 0) {
      const r = (await supabase
        // @ts-expect-error supabase types.ts에 lms_completions 미반영
        .from('lms_completions')
        .select('course_code, phone, email')
        .in('course_code', prereqCodes)
        .in('phone', [...pagePhones])) as unknown as { data: LmsRow[] | null };
      if (r.data) merged.push(...r.data);
    }
    if (pageEmails.size > 0) {
      const r = (await supabase
        // @ts-expect-error supabase types.ts에 lms_completions 미반영
        .from('lms_completions')
        .select('course_code, phone, email')
        .in('course_code', prereqCodes)
        .in('email', [...pageEmails])) as unknown as { data: LmsRow[] | null };
      if (r.data) merged.push(...r.data);
    }
    for (const r of merged) {
      if (!phonesByCourse.has(r.course_code)) {
        phonesByCourse.set(r.course_code, new Set());
        emailsByCourse.set(r.course_code, new Set());
      }
      if (r.phone) phonesByCourse.get(r.course_code)!.add(r.phone.replace(/[^\d]/g, ''));
      if (r.email) emailsByCourse.get(r.course_code)!.add(r.email.trim().toLowerCase());
    }
  }
  const computePrereqDone = (phone: string | null, email: string | null): number => {
    if (prereqMax === 0) return 0;
    const p = (phone ?? '').replace(/[^\d]/g, '');
    const e = (email ?? '').trim().toLowerCase();
    let done = 0;
    for (const code of prereqCodes) {
      const ps = phonesByCourse.get(code);
      const es = emailsByCourse.get(code);
      if ((p && ps?.has(p)) || (e && es?.has(e))) done++;
    }
    return done;
  };

  // 자기주도형 cohort 한정: 특화(종합과정) 이력 뱃지 — 미수료자가 이번 인증시험을
  // 보면 특화 수료증 추가 발급 대상이 되므로 선발 화면에서 바로 보이게 한다.
  const isSelfDirected = cohort?.delivery_method === '자기주도형';
  let specialHistoryMap: Map<string, SpecialHistory> | null = null;
  if (isSelfDirected) {
    specialHistoryMap = await getSpecialCourseHistoryByApplicant();
  }

  // facet counts (필터 적용 전 코호트 전체 기준) — c2 응답 우선, 없으면 applicants.category
  const categoryCounts: Record<string, number> = {
    central: 0,
    metro_local: 0,
    basic_local: 0,
    public: 0,
    education: 0,
    other: 0
  };
  for (const r of statsRows ?? []) {
    const cat = resolveCategoryKey(r.id);
    if (cat && cat in categoryCounts) categoryCounts[cat]++;
  }
  const statusCounts: Record<string, number> = {
    applied: 0,
    selected: 0,
    rejected: 0,
    pre_cancel: 0,
    same_day_cancel: 0
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
    applicant_category: a.applicants?.category ?? null,
    status: a.status,
    rejected_stage: a.rejected_stage,
    knowledge_score: a.knowledge_score,
    knowledge_correct_count: a.knowledge_correct_count,
    knowledge_total_count: a.knowledge_total_count,
    plan_char_count: planCharMap.get(a.id) ?? null,
    prereq_done_count: computePrereqDone(a.applicants?.phone ?? null, a.applicants?.email ?? null),
    cert_text: certQuestion ? (certTextMap.get(a.id) ?? null) : null,
    cert_bucket: certQuestion ? (certBucketMap.get(a.id) ?? 'none') : null,
    special_history: (a.applicants?.id ? specialHistoryMap?.get(a.applicants.id) : null) ?? null,
    applied_at: a.applied_at,
    applicant_edit: a.applicants
      ? {
          id: a.applicants.id,
          name: a.applicants.name,
          organizationName: a.applicants.organizations?.name ?? null,
          category: a.applicants.category,
          department: a.applicants.department,
          job_title: a.applicants.job_title,
          job_role: a.applicants.job_role,
          birth_date: a.applicants.birth_date,
          email: hidePersonal ? null : a.applicants.email,
          personal_email: hidePersonal ? null : a.applicants.personal_email,
          phone: hidePersonal ? null : a.applicants.phone,
          notes: a.applicants.notes
        }
      : null,
    can_edit: !hidePersonal
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
    pending: allRows.filter((r) => r.status === 'applied').length,
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

  const canExport = stats.selected > 0 || stats.rejected > 0;
  const headerAction = (
    <div className='flex flex-wrap items-center justify-end gap-2'>
      <Button variant='outline' size='sm' asChild disabled={!hasQuestions}>
        <Link href={`/dashboard/cohorts/${cohortId}/applications/questions`}>
          <Icons.forms className='mr-1.5' />
          사전문항 미리보기
        </Link>
      </Button>
      <SelectionExportButton cohortId={cohortId} disabled={!canExport} />
      <Button
        variant='outline'
        size='sm'
        asChild
        disabled={stats.selected === 0 && stats.rejected === 0}
      >
        <a href={`/api/cohorts/${cohortId}/applications/notice-export`}>
          <Icons.download className='mr-1.5' />
          통보 명단
        </a>
      </Button>
      <ResetSelectionButton cohortId={cohortId} disabled={stats.total === 0} />
      <SelectionSheet
        cohortId={cohortId}
        defaultCapacity={cohort?.max_capacity ?? 24}
        trigger={
          <Button
            size='sm'
            disabled={stats.total === 0}
            className='bg-gradient-to-r from-indigo-700 to-blue-900 text-white shadow-sm hover:from-indigo-800 hover:to-blue-950 disabled:from-slate-300 disabled:to-slate-400'
          >
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
            prereqMax={prereqMax}
            hasCertQuestion={!!certQuestion}
            showSpecialHistory={isSelfDirected}
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
        <Stat label='기타' value={stats.pending} tone='text-amber-600' />
        <Stat
          label='평균 역량점수'
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
