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
  multi_selected_count: number; // 다수체크 문항(U1) 선택 개수
  multi_choices_max: number; // 그 문항의 보기 총 개수
  prereq_done_count: number; // cohort prereq 과목 중 수료한 개수
  prereq_max: number; // cohort prereq 과목 총 개수 (0이면 prereq 요구 없음)
  current_status: string;
  // 같은 applicant가 다른 cohort에 지원한 active 이력 (applied/pending/selected만)
  other_applications: { cohort_id: string; cohort_name: string; status: string }[];
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
    // 정성평가 = (글자수 정규화 + 다수체크 개수 정규화) / 2 — 50:50 합산
    const charNorm = Math.min(c.plan_char_count / PLAN_CHARS_FULL, 1);
    const multiNorm =
      c.multi_choices_max > 0 ? Math.min(c.multi_selected_count / c.multi_choices_max, 1) : 0;
    const pNorm = (charNorm + multiNorm) / 2;
    const kPart = kNorm * weights.knowledge;
    const cPart = cNorm * weights.category;
    const pPart = pNorm * weights.plan;
    // 반올림은 표시 시점에만 — 정렬은 원점수로 (인위적 동점 방지)
    const final = ((kPart + cPart + pPart) / wSum) * 100;
    return {
      ...c,
      final_score: final,
      parts: { knowledge: kPart, category: cPart, plan: pPart }
    };
  });
}

/**
 * 가중 점수 정렬 → 상위 N명 선발 + 기관별 cap + 사전학습 등급 우선.
 *
 * 정렬 우선순위 (cohort에 prereq 과목이 정의된 경우):
 *  1) prereq_done_count desc (수료 개수 많은 사람부터)
 *  2) 종합점수(원점수) desc
 *  3) 지식점수 desc
 *  4) 부처 우선순위 desc
 *  5) 정성평가 글자수 desc
 *
 * cohort prereq_max = 0이면 prereq 정렬·제외 비활성화 (모든 candidate 동일 취급).
 *
 * @param maxPerOrg 기관당 최대 선발 인원 (0 이하 = 무제한)
 * @param excludeNoPrereq true이고 cohort prereq가 있으면 prereq_done_count=0(미수료)을 강제 제외
 */
export function recommendByWeights(
  candidates: CandidateRow[],
  weights: ScoreWeights,
  totalCapacity: number,
  knowledgeMax: number,
  maxPerOrg: number = 0,
  excludeNoPrereq: boolean = false
): { selectedIds: string[]; scored: ScoredCandidate[] } {
  const hasPrereq = candidates.some((c) => c.prereq_max > 0);
  const filtered = excludeNoPrereq && hasPrereq
    ? candidates.filter((c) => c.prereq_done_count > 0)
    : candidates;
  const scored = scoreAll(filtered, weights, knowledgeMax).toSorted((a, b) => {
    if (hasPrereq && b.prereq_done_count !== a.prereq_done_count) {
      return b.prereq_done_count - a.prereq_done_count;
    }
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    if (b.knowledge_score !== a.knowledge_score) return b.knowledge_score - a.knowledge_score;
    const aCat = CATEGORY_PRIORITY_SCORE[a.category] ?? 0;
    const bCat = CATEGORY_PRIORITY_SCORE[b.category] ?? 0;
    if (bCat !== aCat) return bCat - aCat;
    return b.plan_char_count - a.plan_char_count;
  });

  const cap = maxPerOrg > 0 ? maxPerOrg : Number.POSITIVE_INFINITY;
  const orgCount = new Map<string, number>();
  const selectedIds: string[] = [];
  const limit = Math.max(0, totalCapacity);
  for (const c of scored) {
    if (selectedIds.length >= limit) break;
    const orgKey = c.organization ?? '';
    if (orgKey) {
      const used = orgCount.get(orgKey) ?? 0;
      if (used >= cap) continue;
      orgCount.set(orgKey, used + 1);
    }
    selectedIds.push(c.application_id);
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
