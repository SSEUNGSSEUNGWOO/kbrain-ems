// cohort 일정 정보(application_start_at, application_end_at, started_at, ended_at)
// 를 보고 현재 어느 단계인지 산출. 사이드바·뱃지·페이지 게이팅에서 공통 사용.

export type CohortStage =
  | 'unset'
  | 'preparing'
  | 'recruiting'
  | 'selecting'
  | 'notifying'
  | 'onboarding'
  | 'active'
  | 'finished';

type CohortInput = {
  application_start_at: string | null;
  application_end_at: string | null;
  decided_at?: string | null;
  notified_at?: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export function computeCohortStage(c: CohortInput, now: Date = new Date()): CohortStage {
  const today = now.toISOString().slice(0, 10);

  // 모든 날짜 비어있음 = unset
  const dates = [c.application_start_at, c.application_end_at, c.started_at, c.ended_at];
  if (dates.every((d) => !d)) return 'unset';

  // 교육 시작·종료가 결정됐다면 그것 기준
  if (c.started_at && c.ended_at) {
    if (today < c.started_at) {
      // 모집 단계 우선 처리
      if (c.application_end_at && today <= c.application_end_at) {
        if (c.application_start_at && today < c.application_start_at) return 'preparing';
        return 'recruiting';
      }
      if (c.application_end_at && today > c.application_end_at) {
        if (c.notified_at && today >= c.notified_at) return 'onboarding';
        if (c.decided_at && today >= c.decided_at) return 'notifying';
        return 'selecting';
      }
      return 'preparing';
    }
    if (today >= c.started_at && today <= c.ended_at) return 'active';
    if (today > c.ended_at) return 'finished';
  }

  // 교육 일정 부분만 있을 때
  if (c.application_end_at && today <= c.application_end_at) {
    if (c.application_start_at && today < c.application_start_at) return 'preparing';
    return 'recruiting';
  }
  if (c.application_end_at && today > c.application_end_at) {
    if (c.notified_at && today >= c.notified_at) return 'onboarding';
    if (c.decided_at && today >= c.decided_at) return 'notifying';
    return 'selecting';
  }
  return 'preparing';
}

export const STAGE_LABEL: Record<CohortStage, string> = {
  unset: '일정 미정',
  preparing: '준비',
  recruiting: '모집중',
  selecting: '선발중',
  notifying: '통보중',
  onboarding: '입과',
  active: '진행중',
  finished: '종료'
};

/** 단계별 노출 DOMAIN slug — 사이드바·문서·테이블에서 공통 사용.
 *  사전 세팅 체크(pretraining) 는 모든 stage 에 노출 — 모집 단계부터 운영자가
 *  미리 만들어두고 입과 통보 시 링크 발송, 교육 종료 후에도 응답 확인 필요. */
export const STAGE_DOMAINS: Record<CohortStage, readonly string[]> = {
  recruiting: ['applications', 'students', 'lessons', 'instructors', 'surveys', 'pretraining', 'reports'],
  // 모집 마감 후 선발 작업 중 — applications가 1순위
  selecting: ['applications', 'students', 'lessons', 'instructors', 'surveys', 'pretraining', 'reports'],
  // 합격 통보 중 — applications + students 병행
  notifying: ['applications', 'students', 'lessons', 'instructors', 'surveys', 'pretraining', 'reports'],
  // 통보 완료, 입과 준비 — 추가 응답/명단 확인 필요해 applications 유지
  onboarding: ['applications', 'students', 'lessons', 'attendance', 'instructors', 'surveys', 'diagnoses', 'pretraining', 'reports'],
  active: [
    'applications',
    'students',
    'lessons',
    'attendance',
    'assignments',
    'surveys',
    'diagnoses',
    'pretraining',
    'certification',
    'instructors',
    'reports'
  ],
  finished: [
    'applications',
    'students',
    'attendance',
    'assignments',
    'surveys',
    'diagnoses',
    'pretraining',
    'certification',
    'completion',
    'instructors',
    'reports'
  ],
  // 일정만 있음 — 모집 시작 전이라 학생·강사·수업 계획 메뉴 노출
  preparing: ['applications', 'students', 'lessons', 'instructors', 'surveys', 'pretraining', 'reports'],
  // 일정 정보 자체 부족 — 모든 코어 메뉴 노출 (가장 보수적)
  unset: [
    'applications',
    'students',
    'lessons',
    'attendance',
    'assignments',
    'surveys',
    'pretraining',
    'certification',
    'completion',
    'instructors',
    'reports'
  ]
};
