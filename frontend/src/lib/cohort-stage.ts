/**
 * cohort 라이프사이클 단계 자동 판별.
 *
 *  recruiting : 모집기간 내 (application_start_at ≤ 오늘 ≤ application_end_at)
 *  selecting  : 모집 마감 후 ~ 선발확정일(decided_at) 당일까지. decided_at NULL이면 머무름.
 *  notifying  : decided_at 다음날 ~ 통보일(notified_at) 전.
 *  onboarding : notified_at 도달 후 ~ 교육 시작 전.
 *  active     : 교육기간 내 (started_at ≤ 오늘 ≤ ended_at).
 *               started_at 도달 시 중간 단계와 무관하게 active로 점프(데드라인 fallback).
 *  finished   : 교육 종료 (오늘 > ended_at)
 *  preparing  : 일정은 있지만 아직 모집/교육 시작 전
 *  unset      : 일정 정보 자체가 없음
 *
 * 우선순위 순으로 평가 — 활성/완료가 먼저 걸리면 중간 단계 누락도 안전.
 */

export type CohortStage =
  | 'recruiting'
  | 'selecting'
  | 'notifying'
  | 'onboarding'
  | 'active'
  | 'finished'
  | 'preparing'
  | 'unset';

type StageInput = {
  application_start_at?: string | null;
  application_end_at?: string | null;
  decided_at?: string | null;
  notified_at?: string | null;
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

  // started_at 도달 시 active/finished가 중간 단계보다 우선
  if (c.started_at && c.ended_at && today >= c.started_at && today <= c.ended_at) {
    return 'active';
  }

  if (c.ended_at && today > c.ended_at) {
    return 'finished';
  }

  // 모집 마감 후 ~ 교육 시작 전 사이의 중간 단계
  if (c.application_end_at && today > c.application_end_at) {
    if (c.notified_at && today > c.notified_at) return 'onboarding';
    if (c.decided_at && today > c.decided_at) return 'notifying';
    return 'selecting';
  }

  // 일정(교육 또는 모집)이 박혀 있으면 '준비' — 아직 시작 전
  if (c.started_at || c.application_start_at) {
    return 'preparing';
  }

  return 'unset';
}

export const STAGE_LABEL: Record<CohortStage, string> = {
  recruiting: '모집',
  selecting: '선발',
  notifying: '통보',
  onboarding: '입과대기',
  active: '진행',
  finished: '완료',
  preparing: '준비',
  unset: '미정'
};

/** 단계별 노출 DOMAIN slug — 사이드바·문서·테이블에서 공통 사용 */
export const STAGE_DOMAINS: Record<CohortStage, readonly string[]> = {
  recruiting: ['applications', 'students', 'lessons', 'instructors', 'surveys', 'reports'],
  // 모집 마감 후 선발 작업 중 — applications가 1순위
  selecting: ['applications', 'students', 'lessons', 'instructors', 'surveys', 'reports'],
  // 합격 통보 중 — applications + students 병행
  notifying: ['applications', 'students', 'lessons', 'instructors', 'surveys', 'reports'],
  // 통보 완료, 입과 준비 — 추가 응답/명단 확인 필요해 applications 유지
  onboarding: ['applications', 'students', 'lessons', 'attendance', 'instructors', 'surveys', 'diagnoses', 'reports'],
  active: [
    'students',
    'lessons',
    'attendance',
    'assignments',
    'surveys',
    'diagnoses',
    'instructors',
    'reports'
  ],
  finished: [
    'students',
    'attendance',
    'assignments',
    'surveys',
    'diagnoses',
    'completion',
    'instructors',
    'reports'
  ],
  // 일정만 있음 — 모집 시작 전이라 학생·강사·수업 계획 메뉴 노출
  preparing: ['applications', 'students', 'lessons', 'instructors', 'surveys', 'reports'],
  // 일정 정보 자체 부족 — 모든 코어 메뉴 노출 (가장 보수적)
  unset: [
    'applications',
    'students',
    'lessons',
    'attendance',
    'assignments',
    'surveys',
    'completion',
    'instructors',
    'reports'
  ]
};
