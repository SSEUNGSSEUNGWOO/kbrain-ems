/**
 * cohort 라이프사이클 단계 자동 판별.
 *
 *  recruiting : 모집기간 내 (application_start_at ≤ 오늘 ≤ application_end_at)
 *  active     : 교육기간 내 (started_at ≤ 오늘 ≤ ended_at)
 *  finished   : 교육 종료 (오늘 > ended_at)
 *  preparing  : 일정은 있지만 아직 모집/교육 시작 전
 *  unset      : 일정 정보 자체가 없음
 *
 * 모집기간과 교육기간이 겹치면 모집을 우선 (보통 모집 마감 후 교육 시작이지만 안전).
 */

export type CohortStage = 'recruiting' | 'active' | 'finished' | 'preparing' | 'unset';

type StageInput = {
  application_start_at?: string | null;
  application_end_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
};

export function computeCohortStage(c: StageInput, todayIso?: string): CohortStage {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);

  if (
    c.application_start_at &&
    c.application_end_at &&
    today >= c.application_start_at &&
    today <= c.application_end_at
  ) {
    return 'recruiting';
  }

  if (c.started_at && c.ended_at && today >= c.started_at && today <= c.ended_at) {
    return 'active';
  }

  if (c.ended_at && today > c.ended_at) {
    return 'finished';
  }

  // 일정(교육 또는 모집)이 박혀 있으면 '준비' — 아직 시작 전
  if (c.started_at || c.application_start_at) {
    return 'preparing';
  }

  return 'unset';
}

export const STAGE_LABEL: Record<CohortStage, string> = {
  recruiting: '모집',
  active: '진행',
  finished: '완료',
  preparing: '준비',
  unset: '미정'
};

/** 단계별 노출 DOMAIN slug — 사이드바·문서·테이블에서 공통 사용 */
export const STAGE_DOMAINS: Record<CohortStage, readonly string[]> = {
  recruiting: ['students', 'lessons', 'instructors', 'surveys'],
  active: ['students', 'lessons', 'attendance', 'assignments', 'surveys', 'instructors'],
  finished: [
    'students',
    'attendance',
    'assignments',
    'surveys',
    'completion',
    'instructors',
    'reports'
  ],
  // 일정만 있음 — 모집 시작 전이라 학생·강사·수업 계획 메뉴 노출
  preparing: ['students', 'lessons', 'instructors', 'surveys'],
  // 일정 정보 자체 부족 — 모든 코어 메뉴 노출 (가장 보수적)
  unset: [
    'students',
    'lessons',
    'attendance',
    'assignments',
    'surveys',
    'completion',
    'instructors'
  ]
};
