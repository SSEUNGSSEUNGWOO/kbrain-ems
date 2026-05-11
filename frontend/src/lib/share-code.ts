/**
 * share_code 자동 생성 유틸.
 *
 * 외부에서 URL을 추측해 응답하지 못하도록 마지막에 랜덤 6자(62^6 ≈ 568억)를 붙인다.
 * 앞부분은 운영자가 보고 어느 기수·어느 회차인지 알 수 있게 의미를 유지한다.
 */

/** cohort name에서 "26-1" 같은 기수 prefix 추출. 매칭 실패시 짧은 fallback. */
export function cohortPrefix(cohortName: string): string {
  const m = cohortName.match(/(\d+)-(\d+)기/);
  return m ? `${m[1]}-${m[2]}` : 'cohort';
}

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 암호학적 랜덤 base62 토큰 (default 6자, 62^6 ≈ 568억) */
export function randomToken(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

/**
 * `aichamp-{cohortPrefix}-{MMDD}-{rand6}` 형식의 share_code 생성.
 * dateStr는 YYYY-MM-DD. 잘못된 형식이면 빈 문자열.
 */
export function autoShareCode(dateStr: string, cohortName: string): string {
  const m = dateStr.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `aichamp-${cohortPrefix(cohortName)}-${m[1]}${m[2]}-${randomToken(6)}`;
}
