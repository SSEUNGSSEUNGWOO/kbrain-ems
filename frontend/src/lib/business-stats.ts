// 사업 전체 통계 집계 — 메인 대시보드(/dashboard/overview) 전용.
//
// 과정별 이력(신청·선발·응시·수료·합격), 소속구분별 지원·선발, 기관별 현황을
// 한 번의 전량 로드 + 단일 패스로 계산한다. CLAUDE.md 컨벤션(JS reduce)대로 하되
// PostgREST 1000행 제한 때문에 모든 조회는 range() 페이지네이션 필수.
// 결과는 unstable_cache 로 5분 캐시 (직렬화 제약 — plain object/array 만 반환).

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { ATTENDED_STATUSES, ABSENT_STATUSES } from '@/lib/completion';
import { STUDENT_KEEP_STATUSES } from '@/lib/student-sync';
import { AFFILIATION_LABELS, UNCLASSIFIED_LABEL } from '@/lib/affiliation';
import { isTestStudent } from '@/lib/students';
import { computeCohortStage, type CohortStage } from '@/lib/cohort-stage';

export type AffiliationStatRow = {
  label: string;
  applied: number;
  selected: number;
};

export type CohortHistoryRow = {
  cohortId: string;
  name: string;
  category: string | null; // champion | general | special | experts | null
  startedAt: string | null;
  endedAt: string | null;
  /** 모집·진행·종료 등 현재 단계 (사이드바·대시보드 공통 규칙) */
  stage: CohortStage;
  capacity: number | null; // max_capacity 미설정 기수는 null → '—'
  applied: number;
  selected: number;
  examTaken: number | null; // 인증평가 데이터 없는 기수는 null → '—'
  completed: number | null; // 수료 판정 없는 유형(자기주도형·special·experts)은 null
  certPassed: number | null; // 채점된 행이 0건이면 null → '—'
  affiliations: AffiliationStatRow[]; // 이 기수의 소속구분별 지원·선발 (행 펼침 상세)
};

export type OrganizationStatRow = {
  orgId: string | null; // null = 소속 미지정 묶음
  name: string;
  applied: number;
  selected: number;
  lastSelectedAt: string | null; // 선발 건 중 최근 decided_at
};

export type BusinessStats = {
  kpi: {
    totalApplied: number;
    totalSelected: number;
    totalCompleted: number;
    cohortCount: number;
  };
  cohorts: CohortHistoryRow[];
  affiliations: AffiliationStatRow[];
  organizations: OrganizationStatRow[];
  generatedAt: string;
};

// 소속구분 고정 순서 + 목록 외 라벨 + 미분류 마지막
function orderAffiliations(
  map: Map<string, { applied: number; selected: number }> | undefined
): AffiliationStatRow[] {
  if (!map) return [];
  const rows: AffiliationStatRow[] = [];
  for (const label of AFFILIATION_LABELS) {
    const v = map.get(label);
    if (v) rows.push({ label, ...v });
  }
  for (const [label, v] of map) {
    if ((AFFILIATION_LABELS as readonly string[]).includes(label) || label === UNCLASSIFIED_LABEL)
      continue;
    rows.push({ label, ...v });
  }
  const unclassified = map.get(UNCLASSIFIED_LABEL);
  if (unclassified) rows.push({ label: UNCLASSIFIED_LABEL, ...unclassified });
  return rows;
}

const PAGE = 1000;
type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
async function fetchAllRows<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const acc: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    acc.push(...data);
    if (data.length < PAGE) break;
  }
  return acc;
}

type CohortRow = {
  id: string;
  name: string;
  category: string | null;
  delivery_method: string | null;
  started_at: string | null;
  ended_at: string | null;
  intensive_start_at: string | null;
  intensive_end_at: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  max_capacity: number | null;
  min_attendance: number | null;
  created_at: string;
};
type ApplicationRow = {
  cohort_id: string;
  applicant_id: string;
  status: string;
  decided_at: string | null;
};
type ApplicantRow = {
  id: string;
  name: string;
  category: string | null;
  organization_id: string | null;
};
type CertRow = { cohort_id: string; student_id: string | null; passed: boolean | null };

// export 는 검증 스크립트용 — 화면에서는 캐시 래퍼(getBusinessStats)만 사용할 것
export async function computeBusinessStats(): Promise<BusinessStats> {
  const supabase = createAdminClient();

  const [
    cohorts,
    applications,
    applicants,
    organizations,
    students,
    sessions,
    attendanceRecords,
    attendanceChecks,
    checkRecords,
    certResults
  ] = await Promise.all([
    fetchAllRows<CohortRow>((f, t) =>
      supabase
        .from('cohorts')
        .select(
          'id, name, category, delivery_method, started_at, ended_at, intensive_start_at, intensive_end_at, application_start_at, application_end_at, max_capacity, min_attendance, created_at'
        )
        .range(f, t)
    ),
    fetchAllRows<ApplicationRow>((f, t) =>
      supabase
        .from('applications')
        .select('cohort_id, applicant_id, status, decided_at')
        .range(f, t)
    ),
    fetchAllRows<ApplicantRow>((f, t) =>
      // @ts-expect-error supabase types.ts에 applicants.category 미반영
      supabase.from('applicants').select('id, name, category, organization_id').range(f, t)
    ),
    fetchAllRows<{ id: string; name: string }>((f, t) =>
      supabase.from('organizations').select('id, name').range(f, t)
    ),
    fetchAllRows<{ id: string; cohort_id: string; name: string }>((f, t) =>
      supabase.from('students').select('id, cohort_id, name').range(f, t)
    ),
    fetchAllRows<{ id: string; cohort_id: string; session_date: string }>((f, t) =>
      supabase.from('sessions').select('id, cohort_id, session_date').range(f, t)
    ),
    fetchAllRows<{ student_id: string; session_id: string; status: string }>((f, t) =>
      supabase.from('attendance_records').select('student_id, session_id, status').range(f, t)
    ),
    fetchAllRows<{ id: string; session_id: string }>((f, t) =>
      supabase.from('attendance_checks').select('id, session_id').range(f, t)
    ),
    fetchAllRows<{ check_id: string; student_id: string }>((f, t) =>
      supabase.from('attendance_check_records').select('check_id, student_id').range(f, t)
    ),
    fetchAllRows<CertRow>((f, t) =>
      (
        supabase.from('certification_results' as unknown as 'cohorts') as unknown as {
          select: (cols: string) => { range: (f: number, t: number) => PageResult<CertRow> };
        }
      )
        .select('cohort_id, student_id, passed')
        .range(f, t)
    )
  ]);

  // ── 인덱스 구축 ──
  const applicantById = new Map(applicants.map((a) => [a.id, a]));
  const orgNameById = new Map(organizations.map((o) => [o.id, o.name]));

  const sessionsByCohort = new Map<string, { id: string; session_date: string }[]>();
  for (const s of sessions) {
    const arr = sessionsByCohort.get(s.cohort_id) ?? [];
    arr.push({ id: s.id, session_date: s.session_date });
    sessionsByCohort.set(s.cohort_id, arr);
  }
  const checksBySession = new Map<string, string[]>();
  for (const c of attendanceChecks) {
    const arr = checksBySession.get(c.session_id) ?? [];
    arr.push(c.id);
    checksBySession.set(c.session_id, arr);
  }
  const attStatus = new Map<string, string>();
  for (const r of attendanceRecords) attStatus.set(`${r.student_id}__${r.session_id}`, r.status);
  const checkIns = new Map<string, Set<string>>();
  for (const r of checkRecords) {
    const set = checkIns.get(r.student_id) ?? new Set<string>();
    set.add(r.check_id);
    checkIns.set(r.student_id, set);
  }
  const studentsByCohort = new Map<string, string[]>();
  const testStudentIds = new Set<string>();
  for (const s of students) {
    if (isTestStudent(s.name)) {
      testStudentIds.add(s.id);
      continue;
    }
    const arr = studentsByCohort.get(s.cohort_id) ?? [];
    arr.push(s.id);
    studentsByCohort.set(s.cohort_id, arr);
  }
  const certByCohort = new Map<string, CertRow[]>();
  for (const c of certResults) {
    const arr = certByCohort.get(c.cohort_id) ?? [];
    arr.push(c);
    certByCohort.set(c.cohort_id, arr);
  }

  // 출석 판정 — src/lib/completion.ts 와 동일 규칙
  const isAttended = (studentId: string, sessionId: string): boolean => {
    const status = attStatus.get(`${studentId}__${sessionId}`);
    if (status && ATTENDED_STATUSES.has(status)) return true;
    if (status && ABSENT_STATUSES.has(status)) return false;
    const required = checksBySession.get(sessionId) ?? [];
    if (required.length === 0) return false;
    const mine = checkIns.get(studentId) ?? new Set<string>();
    return required.every((id) => mine.has(id));
  };

  // ── applications 단일 순회: 과정·소속구분·기관 동시 누적 ──
  const KEEP = new Set<string>(STUDENT_KEEP_STATUSES);
  const perCohort = new Map<string, { applied: number; selected: number }>();
  const perAffiliation = new Map<string, { applied: number; selected: number }>();
  const perCohortAffiliation = new Map<
    string,
    Map<string, { applied: number; selected: number }>
  >();
  const perOrg = new Map<
    string,
    { applied: number; selected: number; lastSelectedAt: string | null }
  >();
  const ORG_NONE = '__none__';
  let totalApplied = 0;
  let totalSelected = 0;

  for (const app of applications) {
    const applicant = applicantById.get(app.applicant_id);
    if (!applicant || isTestStudent(applicant.name)) continue;
    const isSelected = KEEP.has(app.status);
    totalApplied++;
    if (isSelected) totalSelected++;

    const co = perCohort.get(app.cohort_id) ?? { applied: 0, selected: 0 };
    co.applied++;
    if (isSelected) co.selected++;
    perCohort.set(app.cohort_id, co);

    const rawLabel = (applicant.category ?? '').trim();
    const label = (AFFILIATION_LABELS as readonly string[]).includes(rawLabel)
      ? rawLabel
      : rawLabel || UNCLASSIFIED_LABEL;
    const aff = perAffiliation.get(label) ?? { applied: 0, selected: 0 };
    aff.applied++;
    if (isSelected) aff.selected++;
    perAffiliation.set(label, aff);

    const coAffMap =
      perCohortAffiliation.get(app.cohort_id) ??
      new Map<string, { applied: number; selected: number }>();
    const coAff = coAffMap.get(label) ?? { applied: 0, selected: 0 };
    coAff.applied++;
    if (isSelected) coAff.selected++;
    coAffMap.set(label, coAff);
    perCohortAffiliation.set(app.cohort_id, coAffMap);

    const orgKey = applicant.organization_id ?? ORG_NONE;
    const org = perOrg.get(orgKey) ?? { applied: 0, selected: 0, lastSelectedAt: null };
    org.applied++;
    if (isSelected) {
      org.selected++;
      if (app.decided_at && (!org.lastSelectedAt || app.decided_at > org.lastSelectedAt)) {
        org.lastSelectedAt = app.decided_at;
      }
    }
    perOrg.set(orgKey, org);
  }

  // ── 기수별 응시·수료·합격 ──
  const cohortRows: CohortHistoryRow[] = cohorts.map((c) => {
    const counts = perCohort.get(c.id) ?? { applied: 0, selected: 0 };
    const certs = (certByCohort.get(c.id) ?? []).filter(
      (r) => !(r.student_id && testStudentIds.has(r.student_id))
    );
    const examTaken =
      certs.length === 0 ? null : new Set(certs.map((r) => r.student_id).filter(Boolean)).size;
    const graded = certs.filter((r) => r.passed !== null);
    const certPassed = graded.length === 0 ? null : graded.filter((r) => r.passed === true).length;

    let completed: number | null = null;
    const studentIds = studentsByCohort.get(c.id) ?? [];
    if (c.category === 'champion' && c.delivery_method !== '자기주도형') {
      // 인증평가 데이터가 아예 없으면 아직 판정 단계 전 — 0 대신 '—'
      if (c.intensive_start_at && c.intensive_end_at && examTaken !== null) {
        const intensive = (sessionsByCohort.get(c.id) ?? []).filter(
          (s) => s.session_date >= c.intensive_start_at! && s.session_date <= c.intensive_end_at!
        );
        const certTakers = new Set(certs.map((r) => r.student_id).filter(Boolean));
        completed = studentIds.filter((sid) => {
          const days = intensive.filter((s) => isAttended(sid, s.id)).length;
          return days >= 3 && certTakers.has(sid);
        }).length;
      }
    } else if (c.category === 'general') {
      const cohortSessions = sessionsByCohort.get(c.id) ?? [];
      if (cohortSessions.length > 0) {
        // 기준 미설정 시 총 회차 수를 넘지 않게 보정 — 1~2회차 과정에 기본 3일이 걸리는 것 방지
        const min = Math.min(c.min_attendance ?? 3, cohortSessions.length);
        completed = studentIds.filter(
          (sid) => cohortSessions.filter((s) => isAttended(sid, s.id)).length >= min
        ).length;
      }
    }

    return {
      cohortId: c.id,
      name: c.name,
      category: c.category,
      startedAt: c.started_at,
      endedAt: c.ended_at,
      stage: computeCohortStage(c),
      capacity: c.max_capacity,
      applied: counts.applied,
      selected: counts.selected,
      examTaken,
      completed,
      certPassed,
      affiliations: orderAffiliations(perCohortAffiliation.get(c.id))
    };
  });
  // 교육 시작일 오름차순 (미정은 뒤, created_at 순)
  const sortedCohortRows = cohortRows.toSorted((a, b) => {
    if (a.startedAt && b.startedAt) return a.startedAt.localeCompare(b.startedAt);
    if (a.startedAt) return -1;
    if (b.startedAt) return 1;
    return 0;
  });

  const affiliations = orderAffiliations(perAffiliation);

  // ── 기관별: 지원 많은 순 ──
  const organizationRows: OrganizationStatRow[] = [...perOrg.entries()]
    .map(([key, v]) => ({
      orgId: key === ORG_NONE ? null : key,
      name: key === ORG_NONE ? '(소속 미지정)' : (orgNameById.get(key) ?? '(알 수 없음)'),
      ...v
    }))
    .toSorted((a, b) => b.applied - a.applied || a.name.localeCompare(b.name, 'ko'));

  return {
    kpi: {
      totalApplied,
      totalSelected,
      totalCompleted: cohortRows.reduce((sum, r) => sum + (r.completed ?? 0), 0),
      cohortCount: cohorts.length
    },
    cohorts: sortedCohortRows,
    affiliations,
    organizations: organizationRows,
    generatedAt: new Date().toISOString()
  };
}

export const getBusinessStats = unstable_cache(computeBusinessStats, ['business-stats'], {
  revalidate: 300
});
