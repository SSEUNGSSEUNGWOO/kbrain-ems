// 인원 명단 다운로드에서 운영자가 체크박스로 선택할 수 있는 컬럼 목록.
// 다이얼로그 UI 와 export-simple route 가 같은 정의를 공유한다.

export type RosterColumnKey =
  | 'category'
  | 'organization'
  | 'department'
  | 'job_title'
  | 'job_role'
  | 'phone'
  | 'email'
  | 'personal_email'
  | 'birth_date'
  | 'notes';

export type RosterColumnSpec = {
  key: RosterColumnKey;
  label: string;
  width: number;
  /** true 면 viewer 권한에서 차단되는 개인정보 컬럼 */
  personal: boolean;
};

export const ROSTER_COLUMNS: RosterColumnSpec[] = [
  { key: 'category', label: '소속기관구분', width: 14, personal: false },
  { key: 'organization', label: '소속기관', width: 30, personal: false },
  { key: 'department', label: '부서', width: 18, personal: false },
  { key: 'job_title', label: '직책', width: 14, personal: false },
  { key: 'job_role', label: '직무', width: 14, personal: false },
  { key: 'phone', label: '연락처', width: 18, personal: true },
  { key: 'email', label: '공공 이메일', width: 26, personal: true },
  { key: 'personal_email', label: '개인 이메일', width: 26, personal: true },
  { key: 'birth_date', label: '생년월일', width: 14, personal: true },
  { key: 'notes', label: '비고', width: 26, personal: false }
];

export const ROSTER_DEFAULT_COLUMNS: RosterColumnKey[] = ['category', 'organization'];

const ALL_KEYS = new Set<RosterColumnKey>(ROSTER_COLUMNS.map((c) => c.key));

/** URL query 의 cols=... 를 파싱해서 유효한 키만 추출 */
export function parseRosterColumns(raw: string | null): RosterColumnKey[] {
  if (!raw) return ROSTER_DEFAULT_COLUMNS;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => ALL_KEYS.has(s as RosterColumnKey)) as RosterColumnKey[];
  return parts.length > 0 ? parts : ROSTER_DEFAULT_COLUMNS;
}

/** viewer 권한 차단 — personal 컬럼 제거 */
export function filterForViewer(
  cols: RosterColumnKey[],
  hidePersonal: boolean
): RosterColumnKey[] {
  if (!hidePersonal) return cols;
  const map = new Map(ROSTER_COLUMNS.map((c) => [c.key, c.personal]));
  return cols.filter((k) => !map.get(k));
}
