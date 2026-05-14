import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import {
  classifyOrganization,
  ORGANIZATION_CATEGORY_LABEL,
  type OrganizationCategory
} from '@/lib/organization-category';
import { computeCohortStage } from '@/lib/cohort-stage';
import { todayKst } from '@/lib/format';
import { CategoryPieChart } from './_components/category-pie-chart';
import { RecruitingCohortsCard } from './_components/recruiting-cohorts-card';
import {
  CohortLineChart,
  type Point as ChartPoint,
  type Series as ChartSeries
} from './_components/cohort-line-chart';
import { ActivityFeed, type Activity } from './_components/activity-feed';

const COHORT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}주 전`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}달 전`;
  return `${Math.floor(day / 365)}년 전`;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.getMonth() + 1}. ${date.getDate()}. (${DOW[date.getDay()]})`;
}

export default async function OverviewPage() {
  const today = todayKst();
  const supabase = createAdminClient();

  // Fetch all cohorts (incl. recruiting metadata)
  const { data: cohortRows, error: cohortError } = await supabase
    .from('cohorts')
    .select(
      'id, name, started_at, ended_at, application_start_at, application_end_at, recruiting_slug, max_capacity'
    )
    .order('name', { ascending: true });
  if (cohortError) throw new Error(cohortError.message);
  const allCohorts = (cohortRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    startedAt: c.started_at,
    endedAt: c.ended_at,
    applicationStartAt: c.application_start_at,
    applicationEndAt: c.application_end_at,
    recruitingSlug: c.recruiting_slug,
    maxCapacity: c.max_capacity
  }));

  // 모집중 cohort 필터링
  const recruitingCohorts = allCohorts.filter(
    (c) =>
      c.recruitingSlug !== null &&
      computeCohortStage({
        application_start_at: c.applicationStartAt,
        application_end_at: c.applicationEndAt,
        started_at: c.startedAt,
        ended_at: c.endedAt
      }) === 'recruiting'
  );

  // 모집중 cohort별 신청자 수 (applications count)
  const applicantCountMap = new Map<string, number>();
  if (recruitingCohorts.length > 0) {
    const ids = recruitingCohorts.map((c) => c.id);
    const { data: appRows } = await supabase
      .from('applications')
      .select('cohort_id')
      .in('cohort_id', ids);
    for (const r of appRows ?? []) {
      applicantCountMap.set(r.cohort_id, (applicantCountMap.get(r.cohort_id) ?? 0) + 1);
    }
  }

  const recruitingForCard = recruitingCohorts
    .filter((c): c is typeof c & { recruitingSlug: string } => !!c.recruitingSlug)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.recruitingSlug,
      applicationEndAt: c.applicationEndAt,
      applicantCount: applicantCountMap.get(c.id) ?? 0,
      maxCapacity: c.maxCapacity
    }));

  // Fetch per-cohort student counts (group by → JS reduce)
  const { data: studentRows, error: studentError } = await supabase
    .from('students')
    .select('cohort_id');
  if (studentError) throw new Error(studentError.message);

  const studentCountMap = new Map<string, number>();
  for (const r of studentRows ?? []) {
    studentCountMap.set(r.cohort_id, (studentCountMap.get(r.cohort_id) ?? 0) + 1);
  }

  // Fetch all sessions with cohort info
  const { data: sessionRows, error: sessionError } = await supabase
    .from('sessions')
    .select('id, cohort_id, session_date, title')
    .order('session_date', { ascending: true });
  if (sessionError) throw new Error(sessionError.message);
  const allSessions = (sessionRows ?? []).map((s) => ({
    id: s.id,
    cohortId: s.cohort_id,
    sessionDate: s.session_date,
    title: s.title
  }));

  // Fetch all attendance records and aggregate in JS
  const { data: attendanceRows, error: attendanceError } = await supabase
    .from('attendance_records')
    .select('session_id, status');
  if (attendanceError) throw new Error(attendanceError.message);

  const attendanceMap = new Map<string, { total: number; present: number }>();
  for (const r of attendanceRows ?? []) {
    if (r.status === 'none') continue;
    const entry = attendanceMap.get(r.session_id) ?? { total: 0, present: 0 };
    entry.total++;
    if (r.status !== 'absent') entry.present++;
    attendanceMap.set(r.session_id, entry);
  }
  const attendanceCounts = Array.from(attendanceMap.entries()).map(([sessionId, v]) => ({
    sessionId,
    total: v.total,
    present: v.present
  }));

  // Build per-cohort data
  const cohortData = allCohorts.map((c) => {
    const cohortSessions = allSessions.filter((s) => s.cohortId === c.id);
    const totalSessions = cohortSessions.length;
    const doneSessions = cohortSessions.filter((s) => s.sessionDate < today).length;
    const nextSession = cohortSessions.find((s) => s.sessionDate >= today);
    const studentCount = studentCountMap.get(c.id) ?? 0;

    // Attendance rate for this cohort
    let totalRecords = 0;
    let presentRecords = 0;
    for (const s of cohortSessions) {
      const att = attendanceMap.get(s.id);
      if (att) {
        totalRecords += att.total;
        presentRecords += att.present;
      }
    }
    const attendanceRate =
      totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : null;

    // Past sessions without attendance records
    const missingAttendance = cohortSessions.filter(
      (s) => s.sessionDate < today && !attendanceMap.has(s.id)
    );

    const progressPct = totalSessions > 0 ? Math.round((doneSessions / totalSessions) * 100) : 0;

    return {
      ...c,
      studentCount,
      totalSessions,
      doneSessions,
      progressPct,
      nextSession,
      attendanceRate,
      missingAttendance
    };
  });

  // Global stats
  const totalStudents = studentRows?.length ?? 0;
  const activeCohorts = cohortData.filter((c) => c.totalSessions > 0).length;

  // Global next session
  const globalNext = allSessions.find((s) => s.sessionDate >= today);
  const globalNextCohort = globalNext ? allCohorts.find((c) => c.id === globalNext.cohortId) : null;

  // All missing attendance across cohorts
  const allMissing = cohortData.flatMap((c) =>
    c.missingAttendance.map((s) => ({
      cohortId: c.id,
      cohortName: c.name,
      sessionId: s.id,
      sessionDate: s.sessionDate,
      title: s.title
    }))
  );

  // Global attendance rate
  let globalTotal = 0;
  let globalPresent = 0;
  for (const att of attendanceCounts) {
    globalTotal += att.total;
    globalPresent += att.present;
  }
  const globalRate = globalTotal > 0 ? Math.round((globalPresent / globalTotal) * 100) : null;

  // 소속 카테고리별 집계
  type StudentOrgRow = {
    organizations: { name: string } | null;
  };
  const { data: studentOrgRowsRaw, error: studentOrgError } = await supabase
    .from('students')
    .select('organizations(name)')
    .returns<StudentOrgRow[]>();
  if (studentOrgError) throw new Error(studentOrgError.message);
  const allStudentOrgs = (studentOrgRowsRaw ?? []).map((r) => ({
    orgName: r.organizations?.name ?? null
  }));

  const CATEGORY_COLORS: Record<OrganizationCategory, string> = {
    central: '#3b82f6',
    basic_local: '#10b981',
    metro_local: '#06b6d4',
    public: '#f59e0b',
    education: '#8b5cf6',
    unknown: '#94a3b8'
  };

  const categoryCounts = allStudentOrgs.reduce(
    (acc, r) => {
      const cat = classifyOrganization(r.orgName);
      acc[cat] = (acc[cat] ?? 0) + 1;
      return acc;
    },
    {} as Record<OrganizationCategory, number>
  );

  const categoryChartData = (
    Object.keys(ORGANIZATION_CATEGORY_LABEL) as OrganizationCategory[]
  ).map((key) => ({
    name: ORGANIZATION_CATEGORY_LABEL[key],
    value: categoryCounts[key] ?? 0,
    color: CATEGORY_COLORS[key]
  }));

  // 출석률 추세 시계열 빌드
  const cohortSeries: ChartSeries[] = allCohorts.map((c, i) => ({
    id: c.id,
    name: c.name.replace('전문인재 ', ''),
    color: COHORT_COLORS[i % COHORT_COLORS.length]
  }));

  // (cohortId, sessionDate) → { total, present } 누적 Map을 한 번만 빌드 — O(sessions).
  // 이후 date×cohort lookup만 → O(dates × cohorts). 삼중 루프 → 이중으로 감소.
  const attendanceDateSet = new Set<string>();
  const attendanceByCohortDate = new Map<string, { total: number; present: number }>();
  for (const s of allSessions) {
    const att = attendanceMap.get(s.id);
    if (!att) continue;
    attendanceDateSet.add(s.sessionDate);
    const key = `${s.cohortId}|${s.sessionDate}`;
    const cur = attendanceByCohortDate.get(key) ?? { total: 0, present: 0 };
    cur.total += att.total;
    cur.present += att.present;
    attendanceByCohortDate.set(key, cur);
  }
  const attendanceDates = [...attendanceDateSet].toSorted();
  const attendanceTrendData: ChartPoint[] = attendanceDates.map((date) => {
    const row: ChartPoint = { date };
    for (const c of allCohorts) {
      const agg = attendanceByCohortDate.get(`${c.id}|${date}`);
      row[c.id] = agg && agg.total > 0 ? Math.round((agg.present / agg.total) * 100) : null;
    }
    return row;
  });
  const activeAttendanceSeries = cohortSeries.filter((s) =>
    attendanceTrendData.some((row) => typeof row[s.id] === 'number')
  );

  // 신청자 누적 곡선 (모집중 cohort 있을 때만)
  let applicationsTrendData: ChartPoint[] = [];
  let applicationsTrendSeries: ChartSeries[] = [];
  if (recruitingCohorts.length > 0) {
    const ids = recruitingCohorts.map((c) => c.id);
    const { data: appliedRows } = await supabase
      .from('applications')
      .select('cohort_id, applied_at')
      .in('cohort_id', ids)
      .not('applied_at', 'is', null);

    const byCohort = new Map<string, string[]>();
    for (const r of appliedRows ?? []) {
      if (!r.applied_at) continue;
      const ymd = r.applied_at.slice(0, 10);
      const arr = byCohort.get(r.cohort_id) ?? [];
      arr.push(ymd);
      byCohort.set(r.cohort_id, arr);
    }

    applicationsTrendSeries = recruitingCohorts.map((c, i) => ({
      id: c.id,
      name: c.maxCapacity
        ? `${c.name.replace('전문인재 ', '')} (목표 ${c.maxCapacity}명)`
        : c.name.replace('전문인재 ', ''),
      color: COHORT_COLORS[i % COHORT_COLORS.length]
    }));

    const dateSet = new Set<string>();
    for (const c of recruitingCohorts) {
      if (c.applicationStartAt) dateSet.add(c.applicationStartAt.slice(0, 10));
    }
    dateSet.add(today);
    for (const dates of byCohort.values()) {
      for (const d of dates) dateSet.add(d);
    }
    const sortedDates = [...dateSet].toSorted();

    applicationsTrendData = sortedDates.map((date) => {
      const row: ChartPoint = { date };
      for (const c of recruitingCohorts) {
        const dates = byCohort.get(c.id) ?? [];
        const startDate = c.applicationStartAt?.slice(0, 10) ?? null;
        const endDate = c.applicationEndAt?.slice(0, 10) ?? null;
        if (startDate && date < startDate) {
          row[c.id] = null;
        } else if (endDate && date > endDate) {
          row[c.id] = null;
        } else {
          row[c.id] = dates.filter((d) => d <= date).length;
        }
      }
      return row;
    });
  }

  // 활동 피드
  type AppliedFeedRow = {
    id: string;
    applied_at: string | null;
    applicant_id: string;
    cohort_id: string;
    applicants: { name: string } | null;
    cohorts: { name: string } | null;
  };
  type SurveyFeedRow = {
    id: string;
    completed_at: string;
    student_id: string;
    survey_id: string;
    students: { name: string } | null;
    surveys: { title: string; cohort_id: string } | null;
  };
  type AssignmentFeedRow = {
    id: string;
    submitted_at: string | null;
    student_id: string;
    assignment_id: string;
    students: { name: string } | null;
    assignments: { title: string; cohort_id: string } | null;
  };

  const FEED_LIMIT_PER_TYPE = 8;
  const FEED_LIMIT_TOTAL = 15;

  const [appliedFeedRes, surveyFeedRes, assignmentFeedRes] = await Promise.all([
    supabase
      .from('applications')
      .select('id, applied_at, applicant_id, cohort_id, applicants(name), cohorts(name)')
      .not('applied_at', 'is', null)
      .order('applied_at', { ascending: false })
      .limit(FEED_LIMIT_PER_TYPE)
      .returns<AppliedFeedRow[]>(),
    supabase
      .from('survey_completions')
      .select('id, completed_at, student_id, survey_id, students(name), surveys(title, cohort_id)')
      .order('completed_at', { ascending: false })
      .limit(FEED_LIMIT_PER_TYPE)
      .returns<SurveyFeedRow[]>(),
    supabase
      .from('assignment_submissions')
      .select(
        'id, submitted_at, student_id, assignment_id, students(name), assignments(title, cohort_id)'
      )
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(FEED_LIMIT_PER_TYPE)
      .returns<AssignmentFeedRow[]>()
  ]);

  const rawActivities: Activity[] = [];
  for (const r of appliedFeedRes.data ?? []) {
    if (!r.applied_at) continue;
    rawActivities.push({
      id: `app-${r.id}`,
      type: 'application',
      time: r.applied_at,
      primary: r.applicants?.name ?? '익명',
      secondary: r.cohorts?.name ?? '',
      href: `/dashboard/applicants/${r.applicant_id}`
    });
  }
  for (const r of surveyFeedRes.data ?? []) {
    rawActivities.push({
      id: `srv-${r.id}`,
      type: 'survey',
      time: r.completed_at,
      primary: r.students?.name ?? '익명',
      secondary: r.surveys?.title ?? '',
      href: r.surveys?.cohort_id ? `/dashboard/cohorts/${r.surveys.cohort_id}/surveys` : undefined
    });
  }
  for (const r of assignmentFeedRes.data ?? []) {
    if (!r.submitted_at) continue;
    rawActivities.push({
      id: `asn-${r.id}`,
      type: 'assignment',
      time: r.submitted_at,
      primary: r.students?.name ?? '익명',
      secondary: r.assignments?.title ?? '',
      href: r.assignments?.cohort_id
        ? `/dashboard/cohorts/${r.assignments.cohort_id}/assignments/${r.assignment_id}`
        : undefined
    });
  }
  rawActivities.sort((a, b) => b.time.localeCompare(a.time));
  const feedItems: Activity[] = rawActivities.slice(0, FEED_LIMIT_TOTAL).map((a) => ({
    ...a,
    time: timeAgo(a.time)
  }));

  return (
    <PageContainer pageTitle='대시보드' pageDescription='교육과정 운영 현황'>
      {/* 현재 모집중 (있을 때만) */}
      <RecruitingCohortsCard cohorts={recruitingForCard} />

      {/* 상단 통계 카드 */}
      <div className='mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <div className='rounded-xl border bg-gradient-to-br from-blue-50 to-white px-6 py-5 dark:from-blue-950/30 dark:to-background'>
          <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50'>
            <Icons.teams className='h-4.5 w-4.5 text-blue-600 dark:text-blue-400' />
          </div>
          <div className='text-muted-foreground text-xs font-medium'>전체 교육생</div>
          <div className='mt-1 text-3xl font-bold'>{totalStudents}명</div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {allCohorts
              .filter((c) => (studentCountMap.get(c.id) ?? 0) > 0)
              .map((c) => `${c.name.replace('전문인재 ', '')} ${studentCountMap.get(c.id)}명`)
              .join(' · ')}
          </div>
        </div>
        <div className='rounded-xl border bg-gradient-to-br from-violet-50 to-white px-6 py-5 dark:from-violet-950/30 dark:to-background'>
          <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/50'>
            <Icons.galleryVerticalEnd className='h-4.5 w-4.5 text-violet-600 dark:text-violet-400' />
          </div>
          <div className='text-muted-foreground text-xs font-medium'>진행 중 과정</div>
          <div className='mt-1 text-3xl font-bold'>{activeCohorts}개</div>
          <div className='text-muted-foreground mt-1 text-xs'>전체 {allCohorts.length}개 과정</div>
        </div>
        <div className='rounded-xl border bg-gradient-to-br from-emerald-50 to-white px-6 py-5 dark:from-emerald-950/30 dark:to-background'>
          <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50'>
            <Icons.circleCheck className='h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400' />
          </div>
          <div className='text-muted-foreground text-xs font-medium'>전체 출석률</div>
          <div className='mt-1 text-3xl font-bold'>
            {globalRate != null ? `${globalRate}%` : '-'}
          </div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {globalTotal > 0 ? `${globalPresent}/${globalTotal}건 출석` : '출결 미입력'}
          </div>
        </div>
        {(() => {
          const isToday = globalNext?.sessionDate === today;
          const card = (
            <>
              <div
                className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${isToday ? 'bg-rose-100 dark:bg-rose-900/50' : 'bg-amber-100 dark:bg-amber-900/50'}`}
              >
                {isToday ? (
                  <span className='h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500' />
                ) : (
                  <Icons.calendar className='h-4.5 w-4.5 text-amber-600 dark:text-amber-400' />
                )}
              </div>
              <div className='text-muted-foreground text-xs font-medium'>
                {isToday ? '오늘 수업' : '다음 수업'}
              </div>
              <div className='mt-1 text-2xl font-bold'>
                {globalNext ? formatShortDate(globalNext.sessionDate) : '-'}
              </div>
              <div className='text-muted-foreground mt-1 truncate text-xs'>
                {globalNext && globalNextCohort
                  ? `${globalNextCohort.name.replace('전문인재 ', '')} · ${globalNext.title ?? ''}`
                  : '예정된 수업 없음'}
              </div>
              {isToday && globalNext && globalNextCohort && (
                <div className='mt-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400'>
                  출결 입력하기 →
                </div>
              )}
            </>
          );
          const cls = `rounded-xl border px-6 py-5 ${isToday ? 'border-rose-200 bg-gradient-to-br from-rose-50 to-white transition hover:border-rose-300 hover:shadow-sm dark:border-rose-900 dark:from-rose-950/30 dark:to-background' : 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-background'}`;
          return isToday && globalNext && globalNextCohort ? (
            <Link
              href={`/dashboard/cohorts/${globalNextCohort.id}/attendance/${globalNext.id}`}
              className={cls}
            >
              {card}
            </Link>
          ) : (
            <div className={cls}>{card}</div>
          );
        })()}
      </div>

      {/* 신청자 누적 곡선 (모집중일 때만) */}
      {recruitingCohorts.length > 0 && (
        <div className='mb-8'>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Icons.trendingUp className='h-4 w-4 text-emerald-600' />
                모집 추이
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CohortLineChart
                data={applicationsTrendData}
                series={applicationsTrendSeries}
                yUnit='명'
                yDomain={[0, 'auto']}
                emptyText='신청 데이터 없음'
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* 출석률 추세 + 최근 활동 */}
      <div className='mb-8 grid gap-4 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader className='pb-3'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Icons.trendingUp className='h-4 w-4 text-blue-600' />
              출석률 추세
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CohortLineChart
              data={attendanceTrendData}
              series={activeAttendanceSeries}
              yUnit='%'
              yDomain={[0, 100]}
              emptyText='출석 데이터 없음'
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Icons.clock className='h-4 w-4 text-violet-600' />
              최근 활동
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed items={feedItems} />
          </CardContent>
        </Card>
      </div>

      {/* 출결 미입력 알림 */}
      {allMissing.length > 0 && (
        <div className='mb-8'>
          <Card className='border-amber-200 dark:border-amber-900'>
            <CardHeader className='pb-3'>
              <CardTitle className='flex items-center gap-2 text-base text-amber-600 dark:text-amber-400'>
                <Icons.warning className='h-4 w-4' />
                출결 미입력 세션 {allMissing.length}개
              </CardTitle>
            </CardHeader>
            <CardContent className='pt-0'>
              <div className='max-h-80 divide-y overflow-y-auto'>
                {allMissing.map((s) => (
                  <div key={s.sessionId} className='flex items-center justify-between gap-3 py-2'>
                    <div className='flex min-w-0 items-center gap-2 text-sm'>
                      <Badge variant='outline' className='shrink-0 text-xs font-normal'>
                        {s.cohortName.replace('전문인재 ', '')}
                      </Badge>
                      <span className='text-muted-foreground shrink-0 text-xs'>
                        {formatShortDate(s.sessionDate)}
                      </span>
                      <span className='truncate'>{s.title ?? '제목 없음'}</span>
                    </div>
                    <Link
                      href={`/dashboard/cohorts/${s.cohortId}/attendance/${s.sessionId}`}
                      className='text-primary shrink-0 text-xs font-medium hover:underline'
                    >
                      입력하기
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 소속 분포 */}
      <div className='mb-8'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>소속 분포</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryPieChart data={categoryChartData} />
          </CardContent>
        </Card>
      </div>

      {/* 교육과정별 현황 */}
      <div className='text-muted-foreground mb-3 text-sm font-medium'>교육과정 현황</div>
      <div className='grid gap-4'>
        {cohortData.map((c) => (
          <Card key={c.id}>
            <CardHeader className='pb-3'>
              <div className='flex items-center justify-between'>
                <CardTitle className='text-lg'>{c.name}</CardTitle>
                <Link
                  href={`/dashboard/cohorts/${c.id}`}
                  className='text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors'
                >
                  상세보기
                  <Icons.chevronRight className='h-3 w-3' />
                </Link>
              </div>
            </CardHeader>
            <CardContent className='pt-0'>
              {/* 기본 정보 */}
              <div className='text-muted-foreground mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm'>
                <span>{c.studentCount}명</span>
                {c.startedAt && <span>시작일 {formatShortDate(c.startedAt)}</span>}
                <span>
                  수업 {c.doneSessions}/{c.totalSessions}회 완료
                </span>
                {c.attendanceRate != null && <span>출석률 {c.attendanceRate}%</span>}
              </div>

              {/* 진행 바 */}
              {c.totalSessions > 0 && (
                <div className='mb-4'>
                  <div className='mb-1 flex items-center justify-between'>
                    <span className='text-muted-foreground text-xs'>진행률</span>
                    <span className='text-xs font-medium'>{c.progressPct}%</span>
                  </div>
                  <div className='bg-muted h-2 overflow-hidden rounded-full'>
                    <div
                      className='h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all'
                      style={{ width: `${c.progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 하단 정보 */}
              <div className='flex flex-wrap gap-x-6 gap-y-2 text-sm'>
                {c.nextSession && (
                  <div className='flex items-center gap-2'>
                    <Icons.calendar className='text-muted-foreground h-3.5 w-3.5' />
                    <span className='text-muted-foreground'>다음 수업</span>
                    <span className='font-medium'>
                      {formatShortDate(c.nextSession.sessionDate)}
                    </span>
                    <span className='text-muted-foreground truncate text-xs'>
                      {c.nextSession.title}
                    </span>
                  </div>
                )}
                {!c.nextSession && c.totalSessions > 0 && (
                  <div className='text-muted-foreground flex items-center gap-2'>
                    <Icons.circleCheck className='h-3.5 w-3.5 text-green-500' />
                    전체 수업 완료
                  </div>
                )}
                {c.missingAttendance.length > 0 && (
                  <div className='flex items-center gap-2 text-amber-600 dark:text-amber-400'>
                    <Icons.warning className='h-3.5 w-3.5' />
                    <span>출결 미입력 {c.missingAttendance.length}건</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
