/**
 * 설문 문항 표시 번호 계산.
 *
 * 룰:
 *   - likert5는 메인 번호 (1, 2, 3, ...)
 *   - 직전 likert5와 같은 섹션·강사를 가진 text 문항은 follow-up — 부모-1 (예: 1-1)
 *   - 그 외 text는 메인 번호 이어감
 *
 * DB의 question_no는 평평한 1..N이라 likert/text가 섞여 있으면 사용자에게 직관적이지 않다.
 * 결과·미리보기·빌더에서 공통 사용.
 */

export type QuestionForFollowUp = {
  id: string;
  type: string;
  section_no: number | null;
  instructor_id: string | null;
};

export type QuestionForDisplay = {
  id: string;
  type: string;
};

/** likert5 직후 text 1개를 follow-up으로 인식 (같은 섹션·강사 조건) */
export function computeFollowUpMap<TQ extends QuestionForFollowUp>(
  questions: TQ[]
): Map<string, string> {
  const map = new Map<string, string>();
  let prev: TQ | null = null;
  for (const q of questions) {
    if (q.type === 'likert5') {
      prev = q;
    } else if (q.type === 'text' && prev) {
      if (prev.section_no === q.section_no && prev.instructor_id === q.instructor_id) {
        map.set(q.id, prev.id);
      }
      prev = null;
    } else {
      prev = null;
    }
  }
  return map;
}

/** 문항 id → 표시 번호 매핑 */
export function buildDisplayNoMap<TQ extends QuestionForDisplay>(
  questions: TQ[],
  followUpMap: Map<string, string>
): Map<string, string> {
  const map = new Map<string, string>();
  let mainNo = 0;
  let lastLikertMainNo = 0;
  for (const q of questions) {
    if (q.type === 'likert5') {
      mainNo++;
      lastLikertMainNo = mainNo;
      map.set(q.id, String(mainNo));
    } else if (q.type === 'text') {
      if (followUpMap.has(q.id)) {
        map.set(q.id, `${lastLikertMainNo}-1`);
      } else {
        mainNo++;
        map.set(q.id, String(mainNo));
      }
    }
  }
  return map;
}
