// 선발 추천 로직 (universal — 서버/클라이언트 양쪽에서 호출)
// 'use server' 파일에 두면 async 강제 + import 시 RSC 경계 문제 → 별도 파일 분리

export type SelectionCategory = 'central' | 'metro_local' | 'basic_local' | 'public_edu' | 'other';

export const SELECTION_CATEGORY_LABEL: Record<SelectionCategory, string> = {
  central: '중앙부처',
  metro_local: '광역지자체',
  basic_local: '기초지자체',
  public_edu: '공공·교육',
  other: '기타'
};

export const SELECTION_CATEGORY_ORDER: SelectionCategory[] = [
  'central',
  'metro_local',
  'basic_local',
  'public_edu',
  'other'
];

export const C2_TO_SELECTION: Record<string, SelectionCategory> = {
  '①': 'central',
  '②': 'metro_local',
  '③': 'basic_local',
  '④': 'public_edu',
  '⑤': 'public_edu',
  '⑥': 'other'
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
  current_status: string;
};

// 분류 우선순위 점수 (0~10 스케일). 운영자 의도: 중앙 > 광역 > 기초 > 공공·교육 > 기타
export const CATEGORY_PRIORITY_SCORE: Record<SelectionCategory, number> = {
  central: 10,
  metro_local: 8,
  basic_local: 6,
  public_edu: 4,
  other: 2
};

// 정성평가 만점 기준 (글자수). 설문 안내 "100자 내외"에 맞춤.
export const PLAN_CHARS_FULL = 100;

export type ScoreWeights = {
  knowledge: number; // 0~100
  category: number; // 0~100
  plan: number; // 0~100
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  knowledge: 60,
  category: 30,
  plan: 10
};

export type ScoredCandidate = CandidateRow & {
  final_score: number; // 0~100 정규화
  parts: { knowledge: number; category: number; plan: number };
};

/**
 * 세 요소의 가중치(0~100)를 정규화 합산해 최종점수 계산.
 *  - 지식점수: knowledge_score / knowledgeMax (clamp 0~1) — knowledgeMax는 cohort의 weight 합
 *  - 분류: CATEGORY_PRIORITY_SCORE / 10
 *  - 정성평가: plan_char_count / PLAN_CHARS_FULL (clamp 0~1)
 * 최종점수 = 정규화된 부분 × 가중치 합.
 */
export function scoreAll(
  candidates: CandidateRow[],
  weights: ScoreWeights,
  knowledgeMax: number
): ScoredCandidate[] {
  const wSum = Math.max(weights.knowledge + weights.category + weights.plan, 1);
  const kMax = Math.max(knowledgeMax, 1);
  return candidates.map((c) => {
    const kNorm = Math.min(Math.max(c.knowledge_score / kMax, 0), 1);
    const cNorm = (CATEGORY_PRIORITY_SCORE[c.category] ?? 0) / 10;
    const pNorm = Math.min(c.plan_char_count / PLAN_CHARS_FULL, 1);
    const kPart = kNorm * weights.knowledge;
    const cPart = cNorm * weights.category;
    const pPart = pNorm * weights.plan;
    const final = ((kPart + cPart + pPart) / wSum) * 100;
    return {
      ...c,
      final_score: Math.round(final * 10) / 10,
      parts: {
        knowledge: Math.round(kPart * 10) / 10,
        category: Math.round(cPart * 10) / 10,
        plan: Math.round(pPart * 10) / 10
      }
    };
  });
}

/** 가중 점수 단일 정렬 → 상위 N명 선발. 동점은 지식점수, 그 다음 글자수로 타이브레이크. */
export function recommendByWeights(
  candidates: CandidateRow[],
  weights: ScoreWeights,
  totalCapacity: number,
  knowledgeMax: number
): { selectedIds: string[]; scored: ScoredCandidate[] } {
  const scored = scoreAll(candidates, weights, knowledgeMax).toSorted((a, b) => {
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    if (b.knowledge_score !== a.knowledge_score) return b.knowledge_score - a.knowledge_score;
    return b.plan_char_count - a.plan_char_count;
  });
  const selectedIds = scored.slice(0, Math.max(0, totalCapacity)).map((c) => c.application_id);
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
    metro_local: 0,
    basic_local: 0,
    public_edu: 0,
    other: 0
  };
  for (const c of scored) {
    if (set.has(c.application_id)) result[c.category]++;
  }
  return result;
}
