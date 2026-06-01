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
  current_status: string;
  // 같은 applicant가 다른 cohort에 지원한 active 이력 (applied/pending/selected만)
  other_applications: { cohort_id: string; cohort_name: string; status: string }[];
  // 이전 사업 인증 이력 (applicants.prior_certs)
  prior_certs: PriorCert[];
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
 * 카테고리별 쿼터 + 사전학습 단계 + 단방향 흘러내림.
 *
 * 정렬 키 (cohort에 prereq가 있는 경우):
 *  1) prereq_done_count desc (2개수료 > 1개 > 0)
 *  2) 종합점수(원점수) desc
 *  3) 지식점수 desc
 *  4) 정성평가 글자수 desc
 * cohort prereq_max=0이면 prereq 정렬·제외 비활성.
 *
 * Phase 1: 각 카테고리 풀에서 쿼터까지 점수순으로 채움.
 * Phase 2: 미달 쿼터는 우선순위 아래 카테고리들 통합 풀에서 보충 (단방향).
 *   중앙 미달 → (지자체+공공+기타) / 지자체 미달 → (공공+기타) / 공공 미달 → (기타).
 *
 * @param maxPerOrg 기관당 최대 (0 = 무제한)
 * @param excludeNoPrereq cohort prereq가 있고 true면 부분 수료(1/2 등)·미수료(0) 모두 강제 제외
 *                        — 전체 수료(prereq_done_count >= prereq_max)만 통과
 */
export function recommendByQuotas(
  candidates: CandidateRow[],
  weights: ScoreWeights,
  totalCapacity: number,
  knowledgeMax: number,
  ratio: QuotaRatio,
  maxPerOrg: number = 0,
  excludeNoPrereq: boolean = false
): { selectedIds: string[]; scored: ScoredCandidate[] } {
  const hasPrereq = candidates.some((c) => c.prereq_max > 0);
  const filtered =
    excludeNoPrereq && hasPrereq
      ? candidates.filter((c) => c.prereq_done_count >= c.prereq_max)
      : candidates;

  const scored = scoreAll(filtered, weights, knowledgeMax).toSorted((a, b) => {
    if (hasPrereq && b.prereq_done_count !== a.prereq_done_count) {
      return b.prereq_done_count - a.prereq_done_count;
    }
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    if (b.knowledge_score !== a.knowledge_score) return b.knowledge_score - a.knowledge_score;
    return b.plan_char_count - a.plan_char_count;
  });

  const quotas = computeQuotas(Math.max(0, totalCapacity), ratio);
  const cap = maxPerOrg > 0 ? maxPerOrg : Number.POSITIVE_INFINITY;
  const orgCount = new Map<string, number>();
  const selectedSet = new Set<string>();
  const selectedIds: string[] = [];

  const tryAdd = (c: ScoredCandidate): boolean => {
    if (selectedSet.has(c.application_id)) return false;
    const orgKey = c.organization ?? '';
    if (orgKey) {
      const used = orgCount.get(orgKey) ?? 0;
      if (used >= cap) return false;
      orgCount.set(orgKey, used + 1);
    }
    selectedSet.add(c.application_id);
    selectedIds.push(c.application_id);
    return true;
  };

  // Phase 1: 카테고리별 쿼터 채우기
  for (const cat of SELECTION_CATEGORY_ORDER) {
    if (quotas[cat] === 0) continue;
    for (const c of scored) {
      if (quotas[cat] === 0) break;
      if (c.category !== cat) continue;
      if (tryAdd(c)) quotas[cat]--;
    }
  }

  // Phase 2: 단방향 흘러내림 — sourceCat의 남은 쿼터를 아래 카테고리들에서 보충
  for (let i = 0; i < SELECTION_CATEGORY_ORDER.length; i++) {
    const sourceCat = SELECTION_CATEGORY_ORDER[i];
    if (quotas[sourceCat] === 0) continue;
    const downstream = new Set(SELECTION_CATEGORY_ORDER.slice(i + 1));
    if (downstream.size === 0) continue;
    for (const c of scored) {
      if (quotas[sourceCat] === 0) break;
      if (!downstream.has(c.category)) continue;
      if (tryAdd(c)) quotas[sourceCat]--;
    }
  }

  return { selectedIds, scored };
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
