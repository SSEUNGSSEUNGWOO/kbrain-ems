import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { computeCohortStage, STAGE_LABEL, type CohortStage } from '@/lib/cohort-stage';
import { todayKst } from '@/lib/format';
import { ActivityFeed, type Activity } from './_components/activity-feed';

// outline 형식 stage 뱃지 색
const STAGE_BADGE_CLASS: Record<CohortStage, string> = {
  recruiting:
    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
  selecting:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
  notifying:
    'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
  onboarding:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  active:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  finished:
    'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300',
  preparing:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  unset:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
};

// SVG/막대 시각화에 쓰는 stage 단색
const STAGE_DOT_COLOR: Record<CohortStage, string> = {
  recruiting: '#f59e0b', // amber
  selecting: '#e11d48', // rose
  notifying: '#06b6d4', // cyan
  onboarding: '#10b981', // emerald
  active: '#3b82f6', // blue
  finished: '#94a3b8', // slate
  preparing: '#a78bfa', // violet
  unset: '#cbd5e1' // slate-300
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.getMonth() + 1}. ${date.getDate()}. (${DOW[date.getDay()]})`;
}

function dDaysBetween(targetIso: string, fromIso: string): number {
  const a = new Date(`${targetIso}T00:00:00`);
  const b = new Date(`${fromIso}T00:00:00`);
  return Math.round((a.getTime() - b.getTime()) / (24 * 3600 * 1000));
}

function formatDday(targetIso: string, fromIso: string): string {
  const d = dDaysBetween(targetIso, fromIso);
  if (d === 0) return 'D-DAY';
  if (d > 0) return `D-${d}`;
  return `D+${-d}`;
}

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

type Urgency = 'critical' | 'soon' | 'pending';

type ActionItem = {
  id: string;
  urgency: Urgency;
  stage: CohortStage | null;
  cohortName: string | null;
  title: string;
  detail: string;
  href: string;
};

const STAGE_PRIORITY: Record<CohortStage, number> = {
  active: 0,
  onboarding: 1,
  notifying: 2,
  selecting: 3,
  recruiting: 4,
  preparing: 5,
  finished: 6,
  unset: 7
};

type CohortStatus = {
  id: string;
  name: string;
  stage: CohortStage;
  studentCount: number;
  applicantCount: number;
  maxCapacity: number | null;
  totalSessions: number;
  doneSessions: number;
  progressPct: number;
  attendanceRate: number | null;
  missingAttendanceCount: number;
  nextSession: { id: string; sessionDate: string; title: string | null } | null;
  targetDate: string | null;
  targetLabel: string | null;
  nextActionLabel: string | null;
  nextActionHref: string | null;
  recruitingSlug: string | null;
};

// 카드/막대에서 stage별 진행도(%) — 시각적 채움 정도 (절대 정확도보다 분위기)
function getStatusBarPct(c: CohortStatus, today: string): number {
  switch (c.stage) {
    case 'recruiting':
      if (!c.maxCapacity) return Math.min(c.applicantCount * 2, 100);
      return Math.min((c.applicantCount / c.maxCapacity) * 100, 100);
    case 'active':
      return c.progressPct;
    case 'finished':
      return 100;
    case 'selecting':
    case 'notifying':
    case 'onboarding': {
      if (!c.targetDate) return 70;
      const d = dDaysBetween(c.targetDate, today);
      if (d <= 0) return 100;
      if (d >= 14) return 30;
      return 100 - (d / 14) * 70;
    }
    case 'preparing': {
      if (!c.targetDate) return 8;
      const d = dDaysBetween(c.targetDate, today);
      if (d >= 60) return 5;
      return Math.max(5, 30 - (d / 60) * 25);
    }
    default:
      return 0;
  }
}

// 도넛/막대 옆에 들어가는 메인 라벨 — stage별 다름
function getStatusLabel(c: CohortStatus, today: string): string {
  switch (c.stage) {
    case 'recruiting':
      return c.maxCapacity
        ? `${c.applicantCount}/${c.maxCapacity}`
        : `${c.applicantCount}명`;
    case 'active':
      return c.totalSessions > 0 ? `${c.progressPct}%` : '대기';
    case 'finished':
      return '완료';
    case 'selecting':
    case 'notifying':
    case 'onboarding':
    case 'preparing':
      return c.targetDate ? formatDday(c.targetDate, today) : '—';
    case 'unset':
      return '—';
  }
}

// 도넛 안 가운데 텍스트는 좀 더 짧게
function getDonutCenterLabel(c: CohortStatus, today: string): string {
  switch (c.stage) {
    case 'recruiting':
      return `${c.applicantCount}`;
    case 'active':
      return c.totalSessions > 0 ? `${c.progressPct}%` : '—';
    case 'finished':
      return '✓';
    case 'selecting':
    case 'notifying':
    case 'onboarding':
    case 'preparing':
      return c.targetDate ? formatDday(c.targetDate, today) : '—';
    default:
      return '—';
  }
}

// PostgREST max-rows(1000) 우회: range로 chunk fetch.
// students/attendance/applications가 1000행 넘어가면 통계가 잘렸음.
async function fetchAllRows<T>(
  builder: () => any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
  const chunk = 1000;
  const out: T[] = [];
  for (let from = 0; from < 1_000_000; from += chunk) {
    const { data, error } = await builder().range(from, from + chunk - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < chunk) break;
  }
  return out;
}

export default async function OverviewPage() {
  const today = todayKst();
  const supabase = createAdminClient();

  // === Fetch ===
  const [cohortRes, students, sessionRes, attendanceRows, appRows] = await Promise.all([
    supabase
      .from('cohorts')
      .select(
        'id, name, started_at, ended_at, application_start_at, application_end_at, decided_at, notified_at, orientation_date, recruiting_slug, max_capacity'
      )
      .order('name', { ascending: true }),
    fetchAllRows<{ id: string; cohort_id: string }>(() =>
      supabase.from('students').select('id, cohort_id')
    ),
    supabase.from('sessions').select('id, cohort_id, session_date, title').order('session_date'),
    fetchAllRows<{ session_id: string; status: string }>(() =>
      supabase.from('attendance_records').select('session_id, status')
    ),
    fetchAllRows<{ cohort_id: string }>(() =>
      supabase.from('applications').select('cohort_id')
    )
  ]);
  if (cohortRes.error) throw new Error(cohortRes.error.message);
  if (sessionRes.error) throw new Error(sessionRes.error.message);
  // 기존 studentRes / attendanceRes / appRes 호환 alias
  const studentRes = { data: students, error: null } as const;
  const attendanceRes = { data: attendanceRows, error: null } as const;
  const appRes = { data: appRows, error: null } as const;

  // risks/issues — 테이블 없을 수도 있어 try-catch
  let openRiskCount = 0;
  let openIssueCount = 0;
  try {
    const [r, i] = await Promise.all([
      supabase.from('risks').select('id', { count: 'exact', head: true }).neq('status', 'closed'),
      supabase.from('issues').select('id', { count: 'exact', head: true }).neq('status', 'closed')
    ]);
    openRiskCount = r.count ?? 0;
    openIssueCount = i.count ?? 0;
  } catch {
    // 무시
  }

  const allCohorts = (cohortRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    startedAt: c.started_at,
    endedAt: c.ended_at,
    applicationStartAt: c.application_start_at,
    applicationEndAt: c.application_end_at,
    decidedAt: c.decided_at,
    notifiedAt: c.notified_at,
    orientationDate: c.orientation_date,
    recruitingSlug: c.recruiting_slug,
    maxCapacity: c.max_capacity
  }));

  // per-cohort 집계 maps
  const studentCountMap = new Map<string, number>();
  for (const r of studentRes.data ?? []) {
    studentCountMap.set(r.cohort_id, (studentCountMap.get(r.cohort_id) ?? 0) + 1);
  }

  const applicationCountMap = new Map<string, number>();
  for (const r of appRes.data ?? []) {
    applicationCountMap.set(r.cohort_id, (applicationCountMap.get(r.cohort_id) ?? 0) + 1);
  }

  const sessionsByCohort = new Map<string, typeof sessionRes.data>();
  for (const s of sessionRes.data ?? []) {
    const arr = sessionsByCohort.get(s.cohort_id) ?? [];
    arr!.push(s);
    sessionsByCohort.set(s.cohort_id, arr);
  }

  const attendanceMap = new Map<string, { total: number; present: number }>();
  for (const r of attendanceRes.data ?? []) {
    if (r.status === 'none') continue;
    const entry = attendanceMap.get(r.session_id) ?? { total: 0, present: 0 };
    entry.total++;
    if (r.status !== 'absent') entry.present++;
    attendanceMap.set(r.session_id, entry);
  }

  // === Cohort 상태 계산 ===
  const cohortStatuses: CohortStatus[] = allCohorts.map((c) => {
    const stage = computeCohortStage({
      application_start_at: c.applicationStartAt,
      application_end_at: c.applicationEndAt,
      decided_at: c.decidedAt,
      notified_at: c.notifiedAt,
      started_at: c.startedAt,
      ended_at: c.endedAt
    });
    const cohortSessions = sessionsByCohort.get(c.id) ?? [];
    const totalSessions = cohortSessions.length;
    const doneSessions = cohortSessions.filter((s) => s.session_date < today).length;
    const nextSessionRow = cohortSessions.find((s) => s.session_date >= today);
    const nextSession = nextSessionRow
      ? {
          id: nextSessionRow.id,
          sessionDate: nextSessionRow.session_date,
          title: nextSessionRow.title
        }
      : null;
    const progressPct = totalSessions > 0 ? Math.round((doneSessions / totalSessions) * 100) : 0;

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

    const missingAttendanceCount = cohortSessions.filter(
      (s) => s.session_date < today && !attendanceMap.has(s.id)
    ).length;

    let targetDate: string | null = null;
    let targetLabel: string | null = null;
    let nextActionLabel: string | null = null;
    let nextActionHref: string | null = `/dashboard/cohorts/${c.id}`;
    switch (stage) {
      case 'recruiting':
        targetDate = c.applicationEndAt;
        targetLabel = '모집 마감';
        nextActionLabel = c.maxCapacity
          ? `신청 ${applicationCountMap.get(c.id) ?? 0} / 정원 ${c.maxCapacity}명`
          : `신청 ${applicationCountMap.get(c.id) ?? 0}명`;
        nextActionHref = `/dashboard/cohorts/${c.id}/applications`;
        break;
      case 'selecting':
        targetDate = c.decidedAt;
        targetLabel = '선발 확정';
        nextActionLabel = '자동선발 또는 명단 검토 후 확정';
        nextActionHref = `/dashboard/cohorts/${c.id}/applications`;
        break;
      case 'notifying':
        targetDate = c.notifiedAt;
        targetLabel = '통보일';
        nextActionLabel = '합격 통보 발송';
        nextActionHref = `/dashboard/cohorts/${c.id}/notifications`;
        break;
      case 'onboarding':
        targetDate = c.orientationDate ?? c.startedAt;
        targetLabel = c.orientationDate ? '입과식' : '교육 시작';
        nextActionLabel = '입과 안내·자료 발송';
        nextActionHref = `/dashboard/cohorts/${c.id}/notifications`;
        break;
      case 'active':
        targetDate = nextSession?.sessionDate ?? null;
        targetLabel = nextSession ? '다음 수업' : null;
        nextActionLabel = nextSession
          ? `다음 수업 ${formatShortDate(nextSession.sessionDate)} · ${nextSession.title ?? ''}`
          : '진행 중인 수업 없음';
        nextActionHref = nextSession
          ? `/dashboard/cohorts/${c.id}/attendance/${nextSession.id}`
          : `/dashboard/cohorts/${c.id}/attendance`;
        break;
      case 'finished':
        targetDate = c.endedAt;
        targetLabel = '종료';
        nextActionLabel = '결과보고서 검토 / 강사료 정산';
        nextActionHref = `/dashboard/cohorts/${c.id}/reports`;
        break;
      case 'preparing':
        targetDate = c.applicationStartAt ?? c.startedAt;
        targetLabel = c.applicationStartAt ? '모집 시작' : '교육 시작';
        nextActionLabel = '일정 점검';
        break;
      case 'unset':
        nextActionLabel = '일정 입력 필요';
        break;
    }

    return {
      id: c.id,
      name: c.name,
      stage,
      studentCount: studentCountMap.get(c.id) ?? 0,
      applicantCount: applicationCountMap.get(c.id) ?? 0,
      maxCapacity: c.maxCapacity,
      totalSessions,
      doneSessions,
      progressPct,
      attendanceRate,
      missingAttendanceCount,
      nextSession,
      targetDate,
      targetLabel,
      nextActionLabel,
      nextActionHref,
      recruitingSlug: c.recruitingSlug
    };
  });

  cohortStatuses.sort((a, b) => {
    const pa = STAGE_PRIORITY[a.stage];
    const pb = STAGE_PRIORITY[b.stage];
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  // === 액션 도출 ===
  const actions: ActionItem[] = [];

  for (const c of cohortStatuses) {
    if (c.missingAttendanceCount > 0) {
      actions.push({
        id: `att-${c.id}`,
        urgency: 'critical',
        stage: 'active',
        cohortName: c.name,
        title: `출결 미입력 ${c.missingAttendanceCount}건`,
        detail: '지난 수업의 출결 기록 누락',
        href: `/dashboard/cohorts/${c.id}/attendance`
      });
    }

    if (c.nextSession?.sessionDate === today) {
      actions.push({
        id: `today-${c.nextSession.id}`,
        urgency: 'critical',
        stage: 'active',
        cohortName: c.name,
        title: '오늘 수업',
        detail: c.nextSession.title ?? '제목 없음',
        href: `/dashboard/cohorts/${c.id}/attendance/${c.nextSession.id}`
      });
    }

    if (c.stage === 'recruiting' && c.targetDate) {
      const d = dDaysBetween(c.targetDate, today);
      if (d >= 0 && d <= 7) {
        actions.push({
          id: `recruit-${c.id}`,
          urgency: d <= 3 ? 'critical' : 'soon',
          stage: 'recruiting',
          cohortName: c.name,
          title: `모집 마감 ${formatDday(c.targetDate, today)}`,
          detail: `현재 ${c.applicantCount}명 신청${c.maxCapacity ? ` / 정원 ${c.maxCapacity}명` : ''}`,
          href: `/dashboard/cohorts/${c.id}/applications`
        });
      }
    }

    if (c.stage === 'selecting') {
      const d = c.targetDate ? dDaysBetween(c.targetDate, today) : null;
      actions.push({
        id: `select-${c.id}`,
        urgency: d !== null && d <= 3 ? 'critical' : 'soon',
        stage: 'selecting',
        cohortName: c.name,
        title: `선발 진행${c.targetDate ? ` · ${formatDday(c.targetDate, today)}` : ''}`,
        detail: '자동선발 또는 명단 검토 후 확정',
        href: `/dashboard/cohorts/${c.id}/applications`
      });
    }

    if (c.stage === 'notifying') {
      const d = c.targetDate ? dDaysBetween(c.targetDate, today) : null;
      actions.push({
        id: `notify-${c.id}`,
        urgency: d !== null && d <= 3 ? 'critical' : 'soon',
        stage: 'notifying',
        cohortName: c.name,
        title: `합격 통보 발송${c.targetDate ? ` · ${formatDday(c.targetDate, today)}` : ''}`,
        detail: '카카오·이메일 등 통보 발송',
        href: `/dashboard/cohorts/${c.id}/notifications`
      });
    }

    if (c.stage === 'onboarding') {
      const d = c.targetDate ? dDaysBetween(c.targetDate, today) : null;
      actions.push({
        id: `onboard-${c.id}`,
        urgency: d !== null && d <= 3 ? 'critical' : 'soon',
        stage: 'onboarding',
        cohortName: c.name,
        title: `입과 안내 발송${c.targetDate ? ` · ${formatDday(c.targetDate, today)}` : ''}`,
        detail: '입과 자료·OT 안내',
        href: `/dashboard/cohorts/${c.id}/notifications`
      });
    }
  }

  const urgencyOrder: Record<Urgency, number> = { critical: 0, soon: 1, pending: 2 };
  actions.sort((a, b) => {
    const ua = urgencyOrder[a.urgency];
    const ub = urgencyOrder[b.urgency];
    if (ua !== ub) return ua - ub;
    return a.title.localeCompare(b.title);
  });

  const criticalCount = actions.filter((a) => a.urgency === 'critical').length;
  const soonCount = actions.filter((a) => a.urgency === 'soon').length;

  // === KPI ===
  const totalStudents = studentRes.data?.length ?? 0;
  const operatingCohorts = cohortStatuses.filter(
    (c) => !['finished', 'preparing', 'unset'].includes(c.stage)
  ).length;
  const totalRecords = attendanceRes.data?.filter((r) => r.status !== 'none').length ?? 0;
  const presentRecords =
    attendanceRes.data?.filter((r) => r.status !== 'none' && r.status !== 'absent').length ?? 0;
  const globalRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : null;

  // KPI 시각화 데이터
  const studentBars = cohortStatuses
    .filter((c) => c.studentCount > 0)
    .map((c) => c.studentCount);
  const operatingPct =
    allCohorts.length > 0 ? Math.round((operatingCohorts / allCohorts.length) * 100) : 0;

  // === Activity Feed (기존 유지) ===
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
  const FEED_LIMIT_TOTAL = 12;

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

  // === Render ===
  return (
    <PageContainer pageTitle='대시보드' pageDescription='오늘 처리할 일과 전체 운영 현황'>
      {/* KPI Row — 미니 시각화 포함 */}
      <div className='mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <KpiBox
          label='전체 교육생'
          value={`${totalStudents}명`}
          sub={`운영 중 ${operatingCohorts}개 기수`}
          viz={
            studentBars.length > 0 ? (
              <MiniBars values={studentBars} color='#3b82f6' height={44} />
            ) : null
          }
        />
        <KpiBox
          label='운영 중 과정'
          value={`${operatingCohorts}개`}
          sub={`전체 ${allCohorts.length}개 기수`}
          viz={
            <MiniDonut
              size={56}
              stroke={6}
              percent={operatingPct}
              color='#3b82f6'
              label={`${operatingCohorts}`}
            />
          }
        />
        <KpiBox
          label='오늘의 액션'
          value={`${actions.length}건`}
          sub={`긴급 ${criticalCount} · 곧 ${soonCount}`}
          viz={<MiniStackedBar critical={criticalCount} soon={soonCount} />}
        />
        <KpiBox
          label='전체 출석률'
          value={globalRate != null ? `${globalRate}%` : '-'}
          sub={totalRecords > 0 ? `${presentRecords}/${totalRecords}건 출석` : '출결 미입력'}
          viz={
            globalRate != null ? (
              <MiniDonut
                size={56}
                stroke={6}
                percent={globalRate}
                color='#10b981'
                label={`${globalRate}%`}
              />
            ) : null
          }
        />
      </div>

      {/* 미해결 이슈/리스크 (있을 때만) */}
      {(openRiskCount > 0 || openIssueCount > 0) && (
        <div className='mb-6 flex flex-wrap gap-3'>
          {openRiskCount > 0 && (
            <Link
              href='/dashboard/risks'
              className='inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60'
            >
              <Icons.warning className='h-3.5 w-3.5' />
              <span className='font-medium'>미해결 리스크 {openRiskCount}건</span>
              <Icons.chevronRight className='h-3 w-3 opacity-70' />
            </Link>
          )}
          {openIssueCount > 0 && (
            <Link
              href='/dashboard/issues'
              className='inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60'
            >
              <Icons.notification className='h-3.5 w-3.5' />
              <span className='font-medium'>미해결 이슈 {openIssueCount}건</span>
              <Icons.chevronRight className='h-3 w-3 opacity-70' />
            </Link>
          )}
        </div>
      )}

      {/* 운영 현황·진행률 — 모든 기수 한눈에 가로 막대 */}
      {cohortStatuses.length > 0 && (
        <Card className='mb-6'>
          <CardHeader className='pb-3'>
            <CardTitle className='flex items-center justify-between text-base'>
              <span className='flex items-center gap-2'>
                <Icons.trendingUp className='h-4 w-4 text-emerald-600' />
                운영 현황 · 진행률
              </span>
              <span className='text-muted-foreground text-xs font-normal'>
                {cohortStatuses.length}개 과정
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            <div className='grid gap-x-8 gap-y-2 sm:grid-cols-2'>
              {cohortStatuses.map((c) => {
                const dot = STAGE_DOT_COLOR[c.stage];
                const pct = getStatusBarPct(c, today);
                const label = getStatusLabel(c, today);
                const isCritical =
                  c.targetDate &&
                  dDaysBetween(c.targetDate, today) >= 0 &&
                  dDaysBetween(c.targetDate, today) <= 3 &&
                  (c.stage === 'selecting' ||
                    c.stage === 'notifying' ||
                    c.stage === 'onboarding' ||
                    c.stage === 'recruiting');
                return (
                  <Link
                    key={c.id}
                    href={`/dashboard/cohorts/${c.id}`}
                    className='hover:bg-muted/50 flex items-center gap-3 rounded-md px-1.5 py-1.5 transition-colors'
                  >
                    <span
                      className='h-2 w-2 shrink-0 rounded-full'
                      style={{ backgroundColor: dot }}
                    />
                    <span className='min-w-0 flex-1 truncate text-xs'>{c.name}</span>
                    <div className='bg-muted h-1.5 w-28 shrink-0 overflow-hidden rounded-full'>
                      <div
                        className='h-full rounded-full transition-all'
                        style={{ width: `${pct}%`, backgroundColor: dot }}
                      />
                    </div>
                    <span
                      className={`w-14 shrink-0 text-right text-xs font-semibold tabular-nums ${
                        isCritical ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'
                      }`}
                    >
                      {label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 오늘의 할 일 + 최근 활동 */}
      <div className='mb-8 grid gap-4 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader className='pb-3'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Icons.checks className='h-4 w-4 text-emerald-600' />
              오늘의 할 일
              <Badge variant='outline' className='ml-1 text-xs font-normal'>
                {actions.length}건
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='flex min-h-0 flex-1 flex-col pt-0'>
            {actions.length === 0 ? (
              <div className='text-muted-foreground py-8 text-center text-sm'>
                처리할 항목이 없습니다.
              </div>
            ) : (
              <div className='min-h-0 flex-1 divide-y overflow-y-auto'>
                {actions.map((a) => (
                  <Link
                    key={a.id}
                    href={a.href}
                    className='hover:bg-accent group flex items-start gap-3 py-2.5 transition-colors'
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        a.urgency === 'critical'
                          ? 'bg-rose-500'
                          : a.urgency === 'soon'
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                      }`}
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        {a.stage && (
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STAGE_BADGE_CLASS[a.stage]}`}
                          >
                            {STAGE_LABEL[a.stage]}
                          </span>
                        )}
                        {a.cohortName && (
                          <span className='text-muted-foreground truncate text-xs'>
                            {a.cohortName}
                          </span>
                        )}
                      </div>
                      <div className='mt-0.5 text-sm font-medium'>{a.title}</div>
                      <div className='text-muted-foreground truncate text-xs'>{a.detail}</div>
                    </div>
                    <Icons.chevronRight className='text-muted-foreground mt-2 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100' />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Icons.clock className='h-4 w-4 text-violet-600' />
              최근 활동
            </CardTitle>
          </CardHeader>
          <CardContent className='pt-0'>
            <ActivityFeed items={feedItems} />
          </CardContent>
        </Card>
      </div>

      {/* 기수별 운영 현황 — 좌측 도넛 + 우측 정보 */}
      <div className='mb-3 flex items-center justify-between'>
        <div className='text-foreground text-sm font-semibold'>기수별 운영 현황</div>
        <Link
          href='/dashboard/cohorts'
          className='text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs'
        >
          전체 보기
          <Icons.chevronRight className='h-3 w-3' />
        </Link>
      </div>
      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
        {cohortStatuses.map((c) => {
          const dot = STAGE_DOT_COLOR[c.stage];
          const pct = getStatusBarPct(c, today);
          const center = getDonutCenterLabel(c, today);
          const dDay = c.targetDate ? formatDday(c.targetDate, today) : null;
          const isCritical =
            c.targetDate &&
            dDaysBetween(c.targetDate, today) >= 0 &&
            dDaysBetween(c.targetDate, today) <= 3 &&
            c.stage !== 'active' &&
            c.stage !== 'finished';
          return (
            <Link
              key={c.id}
              href={`/dashboard/cohorts/${c.id}`}
              className='hover:bg-accent group flex flex-col rounded-xl border bg-card p-4 transition-colors'
            >
              <div className='flex items-start gap-3'>
                <MiniDonut
                  size={56}
                  stroke={5}
                  percent={pct}
                  color={dot}
                  label={center}
                  labelClassName='font-bold'
                />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-1.5'>
                    <span
                      className='h-1.5 w-1.5 shrink-0 rounded-full'
                      style={{ backgroundColor: dot }}
                    />
                    <span className='truncate text-sm font-semibold'>{c.name}</span>
                  </div>
                  <div className='text-muted-foreground mt-1 line-clamp-2 text-xs'>
                    {/* stage별 sub 정보 */}
                    {c.stage === 'active' &&
                      c.totalSessions > 0 &&
                      `수업 ${c.doneSessions} / ${c.totalSessions}회${c.attendanceRate != null ? ` · 출석률 ${c.attendanceRate}%` : ''}`}
                    {c.stage === 'recruiting' && c.targetDate &&
                      `모집 마감 ${formatShortDate(c.targetDate)}`}
                    {(c.stage === 'selecting' || c.stage === 'notifying' || c.stage === 'onboarding') &&
                      c.targetDate &&
                      `${c.targetLabel} ${formatShortDate(c.targetDate)}`}
                    {c.stage === 'preparing' && c.targetDate &&
                      `${c.targetLabel} ${formatShortDate(c.targetDate)}`}
                    {c.stage === 'finished' && c.targetDate &&
                      `${formatShortDate(c.targetDate)} 종료${c.studentCount > 0 ? ` · ${c.studentCount}명` : ''}`}
                    {c.stage === 'unset' && '일정 미입력'}
                  </div>
                </div>
              </div>

              {/* 하단 라인: 다음 액션 + D-Day */}
              <div className='mt-3 flex items-center justify-between gap-2 border-t pt-2.5 text-xs'>
                <span
                  className={`truncate ${
                    c.missingAttendanceCount > 0
                      ? 'font-semibold text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground'
                  }`}
                >
                  {c.missingAttendanceCount > 0
                    ? `출결 미입력 ${c.missingAttendanceCount}건`
                    : (c.nextActionLabel ?? '—')}
                </span>
                {dDay && (
                  <span
                    className={`shrink-0 font-bold tabular-nums ${
                      isCritical ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                    }`}
                  >
                    {dDay}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </PageContainer>
  );
}

// ====== 시각화 헬퍼 ======

function KpiBox({
  label,
  value,
  sub,
  viz
}: {
  label: string;
  value: string;
  sub?: string;
  viz?: React.ReactNode;
}) {
  return (
    <div className='bg-card rounded-xl border px-5 py-4'>
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='text-muted-foreground text-xs font-medium'>{label}</div>
          <div className='mt-1 text-3xl font-bold leading-tight'>{value}</div>
          {sub && <div className='text-muted-foreground mt-1 truncate text-xs'>{sub}</div>}
        </div>
        {viz && <div className='ml-2 flex shrink-0 items-center'>{viz}</div>}
      </div>
    </div>
  );
}

function MiniDonut({
  size = 56,
  stroke = 5,
  percent,
  color,
  label,
  labelClassName
}: {
  size?: number;
  stroke?: number;
  percent: number;
  color: string;
  label: string;
  labelClassName?: string;
}) {
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const offset = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
  const fontSize = Math.max(10, size * 0.22);
  return (
    <svg width={size} height={size} className='shrink-0'>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill='none'
        stroke='#f1f5f9'
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill='none'
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap='round'
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x='50%'
        y='50%'
        dominantBaseline='central'
        textAnchor='middle'
        fontSize={fontSize}
        fontWeight={700}
        fill={color}
        className={labelClassName}
      >
        {label}
      </text>
    </svg>
  );
}

function MiniBars({
  values,
  color,
  height = 40
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  // 10개 초과 시 균등 sampling
  const sampled = values.length > 10 ? sample(values, 10) : values;
  return (
    <div className='flex items-end gap-0.5' style={{ height }}>
      {sampled.map((v, i) => (
        <div
          key={i}
          className='w-1.5 rounded-sm'
          style={{ height: `${Math.max(10, (v / max) * 100)}%`, backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

function MiniStackedBar({ critical, soon }: { critical: number; soon: number }) {
  const total = Math.max(critical + soon, 1);
  return (
    <div className='flex flex-col justify-end gap-1.5 self-stretch'>
      <div className='flex items-center gap-1.5'>
        <span className='h-1.5 w-1.5 rounded-full bg-rose-500' />
        <span className='text-[10px] text-rose-600 dark:text-rose-400'>긴급</span>
        <span className='ml-auto text-xs font-bold tabular-nums text-rose-600 dark:text-rose-400'>
          {critical}
        </span>
      </div>
      <div className='bg-muted h-1.5 w-20 overflow-hidden rounded-full'>
        <div
          className='h-full rounded-full bg-rose-500'
          style={{ width: `${(critical / total) * 100}%` }}
        />
      </div>
      <div className='flex items-center gap-1.5'>
        <span className='h-1.5 w-1.5 rounded-full bg-amber-500' />
        <span className='text-[10px] text-amber-600 dark:text-amber-400'>곧</span>
        <span className='ml-auto text-xs font-bold tabular-nums text-amber-600 dark:text-amber-400'>
          {soon}
        </span>
      </div>
      <div className='bg-muted h-1.5 w-20 overflow-hidden rounded-full'>
        <div
          className='h-full rounded-full bg-amber-500'
          style={{ width: `${(soon / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
