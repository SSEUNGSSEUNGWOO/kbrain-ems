// 선발 추천 로직 (universal — 서버/클라이언트 양쪽에서 호출)
// 'use server' 파일에 두면 async 강제 + import 시 RSC 경계 문제 → 별도 파일 분리

export type SelectionCategory = 'central' | 'local' | 'public_edu' | 'other';

export const SELECTION_CATEGORY_LABEL: Record<SelectionCategory, string> = {
  central: '중앙부처',
  local: '지자체',
  public_edu: '공공·교육',
  other: '기타'
};

// 우선순위 = 흘러내림 방향: 중앙 → 지자체 → 공공 → 기타.
export const SELECTION_CATEGORY_ORDER: SelectionCategory[] = [
  'central',
  'local',
  'public_edu',
  'other'
];

export const C2_TO_SELECTION: Record<string, SelectionCategory> = {
  '①': 'central',
  '②': 'local', // 광역지자체
  '③': 'local', // 기초지자체
  '④': 'public_edu',
  '⑤': 'public_edu',
  '⑥': 'other'
};

export type PriorCert = {
  year: number;
  cert_no: string;
  track: 'green' | 'blue' | 'expert' | 'continuing';
  round: number | null;
  kind: string | null; // 교육형 | 자기주도형 | null
  event: 'hackathon' | 'miniproject' | 'private' | null;
  organization?: string | null;
  cert_name?: string;
};

export type CandidateRow = {
  application_id: string;
  applicant_id: string;
  name: string;
  organization: string | null;
  category: SelectionCategory;
  knowledge_score: number;
  plan_char_count: number;
  plan_text: string;
  multi_selected_count: number; // 다수체크 문항(U1) 선택 개수
  multi_choices_max: number; // 그 문항의 보기 총 개수
  prereq_done_count: number; // cohort prereq 과목 중 수료한 개수
  prereq_max: number; // cohort prereq 과목 총 개수 (0이면 prereq 요구 없음)
  /** 자격연계형 cohort 한정. true=보유, false=없음/예정, null=자격연계형 아님 */
  has_cert: boolean | null;
  current_status: string;
  // 같은 applicant가 다른 cohort에 지원한 active 이력 (applied/pending/selected만)
  other_applications: { cohort_id: string; cohort_name: string; status: string }[];
  // 이전 사업 인증 이력 (applicants.prior_certs)
  prior_certs: PriorCert[];
  /** 자동선발 시 무조건 통과 대상 (전문인재 출신, 개별지정 등). 자세한 사유는 force_reason. */
  force_select: boolean;
  force_reason: string | null;
};

// 정성평가 만점 기준 (글자수). 설문 안내 "100자 내외"에 맞춤.
export const PLAN_CHARS_FULL = 100;

// 점수 가중치 — 시험(지식) : 정성평가 두 축만. 부처는 쿼터로 빠짐.
export type ScoreWeights = {
  knowledge: number; // 0~100
  plan: number; // 0~100
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  knowledge: 50,
  plan: 50
};

// 부처 정원 비율 (기본 5:3:2). other는 쿼터 없음 — 흘러내림 최후 단계에서만 흡수.
export type QuotaRatio = {
  central: number;
  local: number;
  public_edu: number;
};

export const DEFAULT_QUOTA_RATIO: QuotaRatio = {
  central: 5,
  local: 3,
  public_edu: 2
};

export type ScoredCandidate = CandidateRow & {
  final_score: number; // 0~100 정규화
  parts: { knowledge: number; plan: number };
};

// 자동선발 '적용' 시점에 cohorts.selection_config jsonb에 저장되는 스냅샷.
export type SelectionConfigSnapshot = {
  weights: ScoreWeights;
  quotaRatio: QuotaRatio;
  maxPerOrg: number; // 0 = 무제한
  /** 하드 규칙화됨 — 항상 true로 기록 (구 스냅샷 하위호환용 필드 유지) */
  excludeNoPrereq: boolean;
  excludeNoCert: boolean;
  totalCapacity: number; // 사용자가 입력한 정원
  withReserve: boolean; // 110% 예비 적용 여부
  effectiveCapacity: number; // withReserve 적용 후 실제 사용된 정원
  parentOrgCap?: number; // 상위부처(공백 prefix) 캡, 절대 인원수 — 미설정/0=비활성
  excludedCohortIds?: string[]; // 이 cohort들의 selected 신청자는 제외
  exclusionCounts?: Partial<Record<ExclusionStageKey, number>>; // 깔때기 단계별 제외 인원
  exceptions?: string[]; // 예외 허용된 application_id
  appliedAt: string; // ISO timestamp
};

// =============================================================
// 상위부처 그룹핑 매핑 (manual override)
// =============================================================
// 기본 그룹핑은 기관명의 첫 공백 prefix를 상위부처 키로 사용한다.
// 예) "경찰청 서울특별시경찰청" → "경찰청"
//
// 그러나 일부 위원회·산하기관은 단독 명칭(공백 없음)이라 기본
// 그룹핑으론 각자 별도 그룹이 된다. 운영상 같은 부처 산하로 묶고
// 싶을 때는 아래 PARENT_ORG_OVERRIDES에 매핑을 직접 추가한다.
//
// 새 매핑이 필요한 케이스가 누적되면 organizations 테이블에
// parent_org 컬럼을 두는 옵션 B로 확장할 것. 그때까지는 이 dict.
//
// 매핑 결정 출처: 운영진(승우님) 검토 — 자동선발 시 부처별 cap이
// 같은 상위부처 산하 위원회들에 합산 적용되어야 한다는 의견.
const PARENT_ORG_OVERRIDES: Record<string, string> = {
  // 문화체육관광부 산하 위원회
  한국문화예술위원회: '문화체육관광부',
  영화진흥위원회: '문화체육관광부',
  영상물등급위원회: '문화체육관광부',
  // 농림축산식품부 산하 공공기관
  가축위생방역지원본부: '농림축산식품부'
};

// "경찰청 서울특별시경찰청" → "경찰청" / "한국전력공사" → "한국전력공사" / null → ''
// PARENT_ORG_OVERRIDES에 정확히 일치하는 항목이 있으면 그 값을 우선 반환.
export function parentOrgKey(org: string | null | undefined): string {
  if (!org) return '';
  const trimmed = org.trim();
  if (PARENT_ORG_OVERRIDES[trimmed]) return PARENT_ORG_OVERRIDES[trimmed];
  const idx = trimmed.indexOf(' ');
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

// =============================================================
// 깔때기 제외 파이프라인 (Step 1) — 하드 규칙. 노브가 아니라 항상 적용.
// 예외(exceptions)에 담긴 application_id는 모든 규칙을 통과한다.
// =============================================================

export type CohortTrack = 'green' | 'blue' | null;

/** 기수명으로 트랙 판정 — certification/page.tsx와 동일 규칙 */
export function cohortTrackFromName(name: string | null | undefined): CohortTrack {
  if (!name) return null;
  if (name.includes('그린')) return 'green';
  if (name.includes('블루')) return 'blue';
  return null;
}

export type ExclusionStageKey = 'certified' | 'other_cohort' | 'no_prereq' | 'no_cert';

export type ExclusionStage = {
  key: ExclusionStageKey;
  label: string;
  excluded: CandidateRow[];
};

export type ExclusionContext = {
  cohortTrack: CohortTrack;
  /** 이 cohort들에서 status='selected'인 지원자를 제외 (현행 동작 유지) */
  excludedCohortIds: Set<string>;
  /** 예외 허용된 application_id — 모든 제외 규칙 통과 */
  exceptions: Set<string>;
};

/**
 * 제외 단계를 순서대로 적용해 선발 대상 풀과 단계별 제외 명단을 반환.
 * 한 사람은 첫 번째로 걸린 단계에만 잡힌다 (깔때기 시맨틱).
 *
 * force_select는 인증자·사전학습·자격증 제외를 통과하지만
 * 타 기수 기선발 제외는 통과하지 못한다 — 기존 filteredCandidates가
 * force 구분 없이 필터했으므로 동작 보존.
 */
export function runExclusions(
  candidates: CandidateRow[],
  ctx: ExclusionContext
): { pool: CandidateRow[]; stages: ExclusionStage[] } {
  const hasPrereq = candidates.some((c) => c.prereq_max > 0);
  const hasCertQ = candidates.some((c) => c.has_cert !== null);

  const stages: ExclusionStage[] = [];
  if (ctx.cohortTrack) {
    stages.push({
      key: 'certified',
      label: `인증자 제외 (${ctx.cohortTrack === 'green' ? '그린' : '블루'} 트랙 · 연도 무관)`,
      excluded: []
    });
  }
  stages.push({ key: 'other_cohort', label: '타 기수 기선발 제외', excluded: [] });
  if (hasPrereq) {
    stages.push({ key: 'no_prereq', label: '사전학습 미이수 제외', excluded: [] });
  }
  if (hasCertQ) {
    stages.push({ key: 'no_cert', label: '자격증 미보유 제외', excluded: [] });
  }

  const hit = (key: ExclusionStageKey, c: CandidateRow): boolean => {
    switch (key) {
      case 'certified':
        return !c.force_select && c.prior_certs.some((p) => p.track === ctx.cohortTrack);
      case 'other_cohort':
        return c.other_applications.some(
          (o) => o.status === 'selected' && ctx.excludedCohortIds.has(o.cohort_id)
        );
      case 'no_prereq':
        return !c.force_select && c.prereq_done_count < c.prereq_max;
      case 'no_cert':
        return !c.force_select && c.has_cert !== true;
    }
  };

  const pool: CandidateRow[] = [];
  for (const c of candidates) {
    if (ctx.exceptions.has(c.application_id)) {
      pool.push(c);
      continue;
    }
    const stage = stages.find((s) => hit(s.key, c));
    if (stage) stage.excluded.push(c);
    else pool.push(c);
  }
  return { pool, stages };
}

// 배분 결과의 후보별 결정 사유 — Step 3 사유 배지·감사 자료용
export type Decision =
  | { kind: 'selected'; via: 'force' | 'quota' | 'overflow' | 'tie' }
  | { kind: 'rejected'; why: 'org_cap' | 'parent_cap' | 'score_cut'; cutoff?: number };

export const DECISION_LABEL: Record<string, string> = {
  force: '강제선발',
  quota: '쿼터 선발',
  overflow: '흘러내림 선발',
  tie: '동점자 선발',
  org_cap: '기관 cap 초과',
  parent_cap: '상위부처 cap 초과',
  score_cut: '점수 미달'
};

/**
 * 두 부분의 가중합 — 부처는 점수에 포함하지 않고 쿼터로만 처리.
 *  - 지식점수: knowledge_score / knowledgeMax (clamp 0~1)
 *  - 정성평가: (글자수 정규화 + 다수체크 개수 정규화) / 2
 * 최종점수 = (kPart + pPart) / (w.k + w.p) * 100
 */
export function scoreAll(
  candidates: CandidateRow[],
  weights: ScoreWeights,
  knowledgeMax: number
): ScoredCandidate[] {
  const wSum = Math.max(weights.knowledge + weights.plan, 1);
  const kMax = Math.max(knowledgeMax, 1);
  return candidates.map((c) => {
    const kNorm = Math.min(Math.max(c.knowledge_score / kMax, 0), 1);
    const charNorm = Math.min(c.plan_char_count / PLAN_CHARS_FULL, 1);
    const multiNorm =
      c.multi_choices_max > 0 ? Math.min(c.multi_selected_count / c.multi_choices_max, 1) : 0;
    const pNorm = (charNorm + multiNorm) / 2;
    const kPart = kNorm * weights.knowledge;
    const pPart = pNorm * weights.plan;
    const final = ((kPart + pPart) / wSum) * 100;
    return {
      ...c,
      final_score: final,
      parts: { knowledge: kPart, plan: pPart }
    };
  });
}

/**
 * 정원과 비율로 카테고리별 쿼터 계산 (largest-remainder method).
 * 예: total=100, ratio={5,3,2} → {central:50, local:30, public_edu:20, other:0}
 *     total=30,  ratio={5,3,2} → {central:15, local:9,  public_edu:6,  other:0}
 */
export function computeQuotas(
  totalCapacity: number,
  ratio: QuotaRatio
): Record<SelectionCategory, number> {
  const sum = ratio.central + ratio.local + ratio.public_edu;
  if (sum <= 0 || totalCapacity <= 0) {
    return { central: 0, local: 0, public_edu: 0, other: 0 };
  }
  const rawC = (totalCapacity * ratio.central) / sum;
  const rawL = (totalCapacity * ratio.local) / sum;
  const rawP = (totalCapacity * ratio.public_edu) / sum;
  let cC = Math.floor(rawC);
  let cL = Math.floor(rawL);
  let cP = Math.floor(rawP);
  let remainder = totalCapacity - (cC + cL + cP);
  const rems: [keyof QuotaRatio, number][] = [
    ['central', rawC - cC],
    ['local', rawL - cL],
    ['public_edu', rawP - cP]
  ];
  rems.sort((a, b) => b[1] - a[1]);
  for (const [key] of rems) {
    if (remainder <= 0) break;
    if (key === 'central') cC++;
    else if (key === 'local') cL++;
    else cP++;
    remainder--;
  }
  return { central: cC, local: cL, public_edu: cP, other: 0 };
}

/**
 * 카테고리별 쿼터 + 사전학습 단계 + 단방향 흘러내림 + **점진적 기관 cap**.
 * 제외(인증자·사전학습·자격증 등)는 상류 runExclusions에서 이미 끝났다고 가정 —
 * 이 함수는 배분과 결정 사유 기록만 담당한다.
 *
 * 정렬 키 (cohort에 prereq가 있는 경우):
 *  1) prereq_done_count desc (2개수료 > 1개 > 0)
 *  2) 종합점수(원점수) desc
 *  3) 지식점수 desc
 *  4) 정성평가 글자수 desc
 *
 * **점진적 cap 라운드** (maxPerOrg > 0인 경우):
 *  round 1: cap=1 → 풀 얕은 기관까지 1자리 보장
 *  round 2: cap=2 → 잔여 쿼터를 풀 깊은 기관에서 추가 충원
 *  ... round maxPerOrg까지 누적, 정원 차면 조기 종료.
 * maxPerOrg=0(무제한)이면 라운드 1회 cap=∞.
 *
 * 라운드 내부: Phase 1 카테고리 쿼터 채움 → Phase 2 단방향 흘러내림.
 * 종료 후 Phase 3 동점자 구제 (cap은 hard limit 유지).
 *
 * 미선발 사유는 종료 시점 상태로 사후 판정: 기관 cap 소진 → org_cap,
 * 상위부처 cap 소진 → parent_cap, 그 외 → score_cut (카테고리 컷 점수 첨부).
 */
export function recommendByQuotas(
  candidates: CandidateRow[],
  weights: ScoreWeights,
  totalCapacity: number,
  knowledgeMax: number,
  ratio: QuotaRatio,
  maxPerOrg: number = 0,
  parentOrgCap: number = 0 // 상위부처(공백 prefix) 절대 인원수, 0=비활성
): { selectedIds: string[]; scored: ScoredCandidate[]; decisions: Map<string, Decision> } {
  const hasPrereq = candidates.some((c) => c.prereq_max > 0);

  const scored = scoreAll(candidates, weights, knowledgeMax).toSorted((a, b) => {
    if (hasPrereq && b.prereq_done_count !== a.prereq_done_count) {
      return b.prereq_done_count - a.prereq_done_count;
    }
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    if (b.knowledge_score !== a.knowledge_score) return b.knowledge_score - a.knowledge_score;
    return b.plan_char_count - a.plan_char_count;
  });

  const quotas = computeQuotas(Math.max(0, totalCapacity), ratio);
  const pCap = parentOrgCap > 0 ? parentOrgCap : Number.POSITIVE_INFINITY;
  const orgCount = new Map<string, number>();
  const parentCount = new Map<string, number>();
  const selectedSet = new Set<string>();
  const selectedIds: string[] = [];
  const decisions = new Map<string, Decision>();

  // 강제선발 대상 우선 통과 — 카테고리 쿼터·기관 cap·상위부처 cap 모두 무시.
  // 정원(totalCapacity)에서는 자리 차지 (일반 후보용 잔여 정원 감소).
  for (const c of scored) {
    if (!c.force_select) continue;
    const orgKey = c.organization ?? '';
    const parent = parentOrgKey(c.organization);
    if (orgKey) orgCount.set(orgKey, (orgCount.get(orgKey) ?? 0) + 1);
    if (parent) parentCount.set(parent, (parentCount.get(parent) ?? 0) + 1);
    selectedSet.add(c.application_id);
    selectedIds.push(c.application_id);
    decisions.set(c.application_id, { kind: 'selected', via: 'force' });
    if (quotas[c.category] > 0) quotas[c.category]--;
  }

  const capUnlimited = maxPerOrg <= 0;
  const maxRound = capUnlimited ? 1 : maxPerOrg;

  for (let round = 1; round <= maxRound; round++) {
    if (selectedIds.length >= totalCapacity) break;
    const roundCap = capUnlimited ? Number.POSITIVE_INFINITY : round;

    const tryAdd = (c: ScoredCandidate, via: 'quota' | 'overflow'): boolean => {
      if (selectedSet.has(c.application_id)) return false;
      const orgKey = c.organization ?? '';
      const parent = parentOrgKey(c.organization);
      if (orgKey) {
        const used = orgCount.get(orgKey) ?? 0;
        if (used >= roundCap) return false;
      }
      if (parent) {
        const pused = parentCount.get(parent) ?? 0;
        if (pused >= pCap) return false;
      }
      if (orgKey) orgCount.set(orgKey, (orgCount.get(orgKey) ?? 0) + 1);
      if (parent) parentCount.set(parent, (parentCount.get(parent) ?? 0) + 1);
      selectedSet.add(c.application_id);
      selectedIds.push(c.application_id);
      decisions.set(c.application_id, { kind: 'selected', via });
      return true;
    };

    // Phase 1: 카테고리별 잔여 쿼터 채우기 (이번 라운드 cap 한도 내)
    for (const cat of SELECTION_CATEGORY_ORDER) {
      if (quotas[cat] === 0) continue;
      for (const c of scored) {
        if (quotas[cat] === 0) break;
        if (c.category !== cat) continue;
        if (tryAdd(c, 'quota')) quotas[cat]--;
      }
    }

    // Phase 2: 단방향 흘러내림 — sourceCat의 남은 쿼터를 우선순위 순으로 보충.
    for (let i = 0; i < SELECTION_CATEGORY_ORDER.length; i++) {
      const sourceCat = SELECTION_CATEGORY_ORDER[i];
      if (quotas[sourceCat] === 0) continue;
      for (let j = i + 1; j < SELECTION_CATEGORY_ORDER.length; j++) {
        const targetCat = SELECTION_CATEGORY_ORDER[j];
        if (quotas[sourceCat] === 0) break;
        for (const c of scored) {
          if (quotas[sourceCat] === 0) break;
          if (c.category !== targetCat) continue;
          if (tryAdd(c, 'overflow')) quotas[sourceCat]--;
        }
      }
    }
  }

  const finalCap = capUnlimited ? Number.POSITIVE_INFINITY : maxPerOrg;

  // Phase 3: 커트라인 동점자 포함 — 기관 cap·상위부처 cap은 동점자라도 hard limit.
  const tieKey = (c: ScoredCandidate) =>
    `${c.prereq_done_count}|${c.final_score}|${c.knowledge_score}|${c.plan_char_count}`;
  const cutoffByCategory = new Map<SelectionCategory, string>();
  const cutoffScoreByCategory = new Map<SelectionCategory, number>();
  for (const c of scored) {
    if (!selectedSet.has(c.application_id)) continue;
    cutoffByCategory.set(c.category, tieKey(c));
    cutoffScoreByCategory.set(c.category, c.final_score);
  }
  for (const c of scored) {
    if (selectedSet.has(c.application_id)) continue;
    const cutoff = cutoffByCategory.get(c.category);
    if (!cutoff || cutoff !== tieKey(c)) continue;
    const orgKey = c.organization ?? '';
    const parent = parentOrgKey(c.organization);
    if (orgKey && (orgCount.get(orgKey) ?? 0) >= finalCap) continue;
    if (parent && (parentCount.get(parent) ?? 0) >= pCap) continue;
    if (orgKey) orgCount.set(orgKey, (orgCount.get(orgKey) ?? 0) + 1);
    if (parent) parentCount.set(parent, (parentCount.get(parent) ?? 0) + 1);
    selectedSet.add(c.application_id);
    selectedIds.push(c.application_id);
    decisions.set(c.application_id, { kind: 'selected', via: 'tie' });
    cutoffScoreByCategory.set(c.category, c.final_score);
  }

  // 미선발 사유 사후 판정
  for (const c of scored) {
    if (selectedSet.has(c.application_id)) continue;
    const orgKey = c.organization ?? '';
    const parent = parentOrgKey(c.organization);
    if (orgKey && (orgCount.get(orgKey) ?? 0) >= finalCap) {
      decisions.set(c.application_id, { kind: 'rejected', why: 'org_cap' });
    } else if (parent && (parentCount.get(parent) ?? 0) >= pCap) {
      decisions.set(c.application_id, { kind: 'rejected', why: 'parent_cap' });
    } else {
      decisions.set(c.application_id, {
        kind: 'rejected',
        why: 'score_cut',
        cutoff: cutoffScoreByCategory.get(c.category)
      });
    }
  }

  return { selectedIds, scored, decisions };
}

/** 선택된 후보들의 분류별 인원 분포 카운트 */
export function distributeByCategory(
  scored: ScoredCandidate[],
  selectedIds: string[]
): Record<SelectionCategory, number> {
  const set = new Set(selectedIds);
  const result: Record<SelectionCategory, number> = {
    central: 0,
    local: 0,
    public_edu: 0,
    other: 0
  };
  for (const c of scored) {
    if (set.has(c.application_id)) result[c.category]++;
  }
  return result;
}
