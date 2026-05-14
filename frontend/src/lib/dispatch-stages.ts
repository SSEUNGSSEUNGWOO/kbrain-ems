// 알림 발송 단계 — 모집·입과·종강·수료의 트리거 단계 산출.
//
// 사용처:
//   - /dashboard/notifications (글로벌 inbox)
//   - /dashboard/cohorts/[id]/notifications (cohort별)
//   - 사이드바 미발송 카운트 배지
//
// cohort마다 활성화 단계는 cohort_dispatch_config 테이블로 관리.
// row 없으면 enabled=true 기본값.

export type DispatchTemplate =
  | 'recruit_pass'             // 모집 합격자 발표
  | 'recruit_fail'             // 모집 불합격자 발표
  | 'd7_orientation'           // 입과 안내 (시작 -7일)
  | 'd3_prereq_check'          // 사전이수 미완료자 리마인드 (시작 -3일)
  | 'd1_reminder'              // 개강 D-1 리마인드
  | 'd0_arrival'               // 개강 당일 도착 안내
  | 'closing_d1'               // 종강 D-1 안내
  | 'completion_certificate';  // 수료증 발급 안내

export type DispatchStageState =
  | 'sent'         // 발송 완료
  | 'overdue'      // 발송일 + 1일 초과, 미발송
  | 'due'          // 발송일 -2 ~ +1일 windowed
  | 'upcoming'     // 발송일 -2일 이전
  | 'no_trigger';  // 트리거 컬럼(예: decided_at) 비어있음

export type DispatchTriggerColumn =
  | 'decided_at'
  | 'started_at'
  | 'ended_at';

export type DispatchRecipientFilter =
  | 'all_students'           // 전체 등록자 (D-7/D-3/D-1/D-0/종강/수료)
  | 'selected_applicants'    // 합격자 (applications.status='selected')
  | 'rejected_applicants';   // 불합격자 (applications.status != 'selected')

export type StageDef = {
  code: DispatchTemplate;
  label: string;
  triggerColumn: DispatchTriggerColumn;
  offsetDays: number;          // 트리거 컬럼 기준 (음수=이전, 0=당일, 양수=이후)
  hint: string;
  recipientFilter: DispatchRecipientFilter;
  notBeforeColumn?: DispatchTriggerColumn;  // ideal_send_date가 이 컬럼보다 빠를 수 없음 (짧은 과정 충돌 방지)
  mergeGroup?: string;  // 같은 mergeGroup + 같은 ideal_send_date면 통합 발송 (예: 합격자 발표·D-7 입과 안내)
  skipOnSingleDay?: boolean;  // started_at === ended_at(1일 과정)이면 자동 비활성
};

export const STAGE_CATALOG: ReadonlyArray<StageDef> = [
  {
    code: 'recruit_pass',
    label: '합격자 발표',
    triggerColumn: 'decided_at',
    offsetDays: 0,
    hint: '선발 확정자에게 합격·입과 자격 안내',
    recipientFilter: 'selected_applicants',
    mergeGroup: 'pass_orientation'
  },
  {
    code: 'recruit_fail',
    label: '불합격자 발표',
    triggerColumn: 'decided_at',
    offsetDays: 0,
    hint: '미선발자에게 발표 (선택 단계)',
    recipientFilter: 'rejected_applicants'
  },
  {
    code: 'd7_orientation',
    label: 'D-7 입과 안내',
    triggerColumn: 'started_at',
    offsetDays: -7,
    hint: '과정 개요·일정·사전이수 안내·준비물',
    recipientFilter: 'all_students',
    notBeforeColumn: 'decided_at', // 합격자 발표보다 빠르면 발표일로 자동 정렬
    mergeGroup: 'pass_orientation'
  },
  {
    code: 'd3_prereq_check',
    label: 'D-3 사전이수 미완료자 알림',
    triggerColumn: 'started_at',
    offsetDays: -3,
    hint: '이러닝 진도율 점검 후 미완료자 개별 알림',
    recipientFilter: 'all_students'
  },
  {
    code: 'd1_reminder',
    label: 'D-1 리마인드',
    triggerColumn: 'started_at',
    offsetDays: -1,
    hint: '장소·접속링크·주차·연락처',
    recipientFilter: 'all_students'
  },
  {
    code: 'd0_arrival',
    label: 'D-day 접속·도착 안내',
    triggerColumn: 'started_at',
    offsetDays: 0,
    hint: '당일 접속·도착 안내',
    recipientFilter: 'all_students'
  },
  {
    code: 'closing_d1',
    label: '종강 D-1 안내',
    triggerColumn: 'ended_at',
    offsetDays: -1,
    hint: '종강식·수료 평가·설문 안내',
    recipientFilter: 'all_students',
    skipOnSingleDay: true
  },
  {
    code: 'completion_certificate',
    label: '수료증 발급 안내',
    triggerColumn: 'ended_at',
    offsetDays: 7,
    hint: '수료증 발급 일정·방법 안내',
    recipientFilter: 'all_students'
  }
];

export type NotificationLite = {
  id: string;
  template_code: string | null;
  status: string;
  channels: string[] | null;
  channel: string;
  sent_at: string | null;
  sent_by_operator_id: string | null;
};

export type DispatchStage = {
  template: DispatchTemplate;
  label: string;
  hint: string;
  triggerColumn: DispatchTriggerColumn;
  ideal_send_date: string | null; // YYYY-MM-DD or null(트리거 미설정)
  d_offset_from_today: number | null; // 트리거 기준 오늘 D값 (no_trigger면 null)
  state: DispatchStageState;
  latest_notification: NotificationLite | null;
  recipientFilter: DispatchRecipientFilter;
};

export type CohortDates = {
  decided_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
};

const isoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (yyyy_mm_dd: string, days: number): string => {
  const [y, m, d] = yyyy_mm_dd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
};

const dayDiff = (from: string, to: string): number => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
};

/** 트리거 날짜에서 datetime 추출 (TIMESTAMPTZ는 ISO, DATE는 그대로). */
const extractDate = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  // YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM:SS
  return raw.slice(0, 10);
};

/**
 * cohort + 단계별 enable 설정 + 오늘 + notifications로 8단계 산출.
 *
 * enabledMap: template_code → enabled (false면 비활성). 키 없으면 기본 true.
 */
export function computeDispatchStages(
  cohort: CohortDates,
  today: string,
  notifications: NotificationLite[],
  enabledMap?: Map<string, boolean>
): DispatchStage[] {
  const byTemplate = new Map<string, NotificationLite[]>();
  for (const n of notifications) {
    if (!n.template_code) continue;
    const arr = byTemplate.get(n.template_code) ?? [];
    arr.push(n);
    byTemplate.set(n.template_code, arr);
  }

  const startedDate = extractDate(cohort.started_at);
  const endedDate = extractDate(cohort.ended_at);
  const isSingleDay = !!(startedDate && endedDate && startedDate === endedDate);

  return STAGE_CATALOG.filter((t) => enabledMap?.get(t.code) !== false)
    .filter((t) => !(isSingleDay && t.skipOnSingleDay))
    .map((t) => {
    const trigger = extractDate(cohort[t.triggerColumn]);
    let idealDate = trigger ? addDays(trigger, t.offsetDays) : null;
    if (idealDate && t.notBeforeColumn) {
      const floor = extractDate(cohort[t.notBeforeColumn]);
      if (floor && idealDate < floor) idealDate = floor;
    }
    const offsetFromToday = idealDate ? dayDiff(today, idealDate) : null;

    const matching = byTemplate.get(t.code) ?? [];
    const sent = matching.find((n) => n.status === 'sent' && n.sent_at) ?? null;

    let state: DispatchStageState;
    if (sent) {
      state = 'sent';
    } else if (offsetFromToday === null) {
      state = 'no_trigger';
    } else if (offsetFromToday >= 2) {
      state = 'upcoming';
    } else if (offsetFromToday >= -1) {
      state = 'due';
    } else {
      state = 'overdue';
    }

    return {
      template: t.code,
      label: t.label,
      hint: t.hint,
      triggerColumn: t.triggerColumn,
      ideal_send_date: idealDate,
      d_offset_from_today: offsetFromToday,
      state,
      latest_notification: sent ?? matching[0] ?? null,
      recipientFilter: t.recipientFilter
    };
  });
}

/**
 * 오늘이 cohort의 알림 범위 안인지.
 * 트리거 컬럼이 셋 다 비면 false.
 * 어느 하나라도 (오늘 -30d ~ +maxFutureDays) 사이면 true.
 */
export function isInDispatchWindow(
  cohort: CohortDates,
  today: string,
  maxFutureDays = 14
): boolean {
  for (const col of ['decided_at', 'started_at', 'ended_at'] as const) {
    const d = extractDate(cohort[col]);
    if (!d) continue;
    const offset = dayDiff(today, d);
    if (offset >= -30 && offset <= maxFutureDays) return true;
  }
  return false;
}

export const stateLabel = (s: DispatchStageState): string => {
  switch (s) {
    case 'sent':
      return '발송 완료';
    case 'overdue':
      return '지연';
    case 'due':
      return '발송 시점';
    case 'upcoming':
      return '예정';
    case 'no_trigger':
      return '날짜 미설정';
  }
};

/** 오늘 발송 처리 필요한 단계인지 (사이드바 배지 카운트). */
export const isPendingActionable = (state: DispatchStageState): boolean =>
  state === 'due' || state === 'overdue';

/**
 * 같은 ideal_send_date를 가진 단계들을 한 그룹으로 묶기.
 * 단계 통합 발송용 (예: 짧은 과정에서 합격자 발표 + D-7이 같은 날).
 */
export type DispatchStageGroup = {
  templates: DispatchTemplate[];
  labels: string[];
  hint: string;
  ideal_send_date: string | null;
  d_offset_from_today: number | null;
  state: DispatchStageState; // 가장 우선 상태 (overdue > due > upcoming > sent)
  latest_notifications: NotificationLite[]; // 그룹 내 sent된 row만 (개별 취소용)
  recipientFilter: DispatchRecipientFilter; // 그룹 첫 단계 기준 (보통 합격자 발표가 먼저)
};

const stagePriority = (s: DispatchStageState): number => {
  switch (s) {
    case 'overdue':
      return 0;
    case 'due':
      return 1;
    case 'upcoming':
      return 2;
    case 'no_trigger':
      return 3;
    case 'sent':
      return 4;
  }
};

export function groupStagesByDate(stages: DispatchStage[]): DispatchStageGroup[] {
  // mergeGroup이 명시된 단계만 통합. 같은 mergeGroup + 같은 ideal_send_date면 한 row.
  // mergeGroup 없는 단계는 항상 단독.
  const catalogByTemplate = new Map(STAGE_CATALOG.map((c) => [c.code, c]));
  const buckets = new Map<string, DispatchStage[]>();
  for (const s of stages) {
    const def = catalogByTemplate.get(s.template);
    const mg = def?.mergeGroup;
    const key = mg
      ? `mg:${mg}|${s.ideal_send_date ?? '__null__'}`
      : `solo:${s.template}`;
    const arr = buckets.get(key) ?? [];
    arr.push(s);
    buckets.set(key, arr);
  }
  return Array.from(buckets.values()).map((arr) => {
    // 그룹 상태: 가장 우선순위 높은 단계의 state 사용 + sent 단계 분리
    const sentCount = arr.filter((s) => s.state === 'sent').length;
    const allSent = sentCount === arr.length;
    const groupState: DispatchStageState = allSent
      ? 'sent'
      : (arr
          .filter((s) => s.state !== 'sent')
          .sort((a, b) => stagePriority(a.state) - stagePriority(b.state))[0]?.state ??
        arr[0].state);
    return {
      templates: arr.map((s) => s.template),
      labels: arr.map((s) => s.label),
      hint: arr.map((s) => s.hint).join(' · '),
      ideal_send_date: arr[0].ideal_send_date,
      d_offset_from_today: arr[0].d_offset_from_today,
      state: groupState,
      latest_notifications: arr
        .map((s) => (s.state === 'sent' ? s.latest_notification : null))
        .filter((x): x is NotificationLite => !!x),
      recipientFilter: arr[0].recipientFilter
    };
  });
}

/**
 * inbox에 표시할 만큼 임박한 단계인지.
 * - overdue/due: 항상 포함
 * - upcoming: 오늘 +maxDays 이내만 (기본 7일)
 * - no_trigger/sent: 항상 제외 (호출 측에서 sent는 별도 필터)
 */
export const isStageInInboxRange = (stage: DispatchStage, maxDays = 7): boolean => {
  if (stage.state === 'sent' || stage.state === 'no_trigger') return false;
  if (stage.state === 'overdue' || stage.state === 'due') return true;
  // upcoming
  return stage.d_offset_from_today !== null && stage.d_offset_from_today <= maxDays;
};
