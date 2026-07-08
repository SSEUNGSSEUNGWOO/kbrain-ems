/**
 * CBT 자동채점 공통 로직.
 * submitSession(응시자 제출 시)과 export/route.ts(관리자 xlsx)에서 동일 로직으로
 * 채점하도록 통일. 미래에 관대성 조정 시 이 파일 하나만 수정하면 됨.
 */

/**
 * 단답형 응답·정답 정규화.
 * 공백·구두점·괄호·특수문자·언더스코어를 모두 제거하고 소문자로 변환한다.
 * 예:
 *   "Q, K, V"   → "qkv"
 *   "Q·K·V"     → "qkv"
 *   "chunk_size" → "chunksize"
 *   "청크 크기"  → "청크크기"
 */
export function normalizeShortAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s,·、\.\-_/\\|()<>"'`~!?;:*+=&%$#@\[\]{}]/g, '');
}

/**
 * 단답형 응답이 정답 keywords 중 하나와 일치하는지 판정.
 * 응답도 keywords도 동일한 정규화 후 문자열 일치로 비교.
 */
export function isShortAnswerCorrect(
  answerText: string | null | undefined,
  keywords: string[] | null | undefined
): boolean {
  if (!answerText) return false;
  const normAns = normalizeShortAnswer(answerText);
  if (normAns.length === 0) return false;
  const normKws = (keywords ?? []).map(normalizeShortAnswer).filter((k) => k.length > 0);
  return normKws.some((k) => k === normAns);
}

/**
 * 객관식 응답이 정답 key와 일치하는지 판정.
 * (지금은 단순 문자열 비교지만 향후 관대화 필요 시 이 함수에서 처리)
 */
export function isMultipleChoiceCorrect(
  answerKey: string | null | undefined,
  correctKey: string | null | undefined
): boolean {
  if (!answerKey || !correctKey) return false;
  return answerKey === correctKey;
}
