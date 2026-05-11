/**
 * cohort 라이프사이클 단계 자동 판별.
 *
 *  recruiting : 모집기간 내 (application_start_at ≤ 오늘 ≤ application_end_at)
 *  active     : 교육기간 내 (started_at ≤ 오늘 ≤ ended_at)
 *  finished   : 교육 종료 (오늘 > ended_at)
 *  unset      : 날짜 정보 부족
 *
 * 모집기간과 교육기간이 겹치면 모집을 우선 (보통 모집 마감 후 교육 시작이지만 안전).
 */

export type CohortStage = 'recruiting' | 'active' | 'finished' | 'unset';

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

  return 'unset';
}

export const STAGE_LABEL: Record<CohortStage, string> = {
  recruiting: '모집',
  active: '진행',
  finished: '완료',
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
  // 날짜 정보 부족 — 모든 코어 메뉴 노출 (가장 보수적)
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
