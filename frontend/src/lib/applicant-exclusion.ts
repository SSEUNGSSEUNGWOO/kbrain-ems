// 지원자 예외 처리 — 삭제 대신 표시로 남긴다.
//
// 두 종류를 구분하는 이유:
//  - test         : 실재하지 않는 사람(테스트·내부 계정) → 모든 집계에서 완전 제외
//  - not_eligible : 실제로 신청은 했으나 교육 대상 아님(사립대·민간)
//                   → 신청 건수에는 남기고 선발 후보에서만 제외.
//                   완전 제외하면 발주처에 보고한 "총 지원 건수"가 흔들린다.

export const EXCLUSION_REASONS = ['test', 'not_eligible', 'duplicate'] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  test: '테스트·내부',
  not_eligible: '대상 아님',
  duplicate: '중복'
};

export const EXCLUSION_TONE: Record<ExclusionReason, string> = {
  test: 'border-slate-200 bg-slate-50 text-slate-600',
  not_eligible: 'border-rose-200 bg-rose-50 text-rose-700',
  duplicate: 'border-amber-200 bg-amber-50 text-amber-800'
};

export type ExcludableApplicant = {
  name?: string | null;
  excluded_reason?: string | null;
};

const isReason = (v: string | null | undefined): v is ExclusionReason =>
  !!v && (EXCLUSION_REASONS as readonly string[]).includes(v);

/** 이름이 '테스트'로 시작 — excluded_reason 도입 전부터 쓰던 규칙. 당분간 병행 인정. */
export function isLegacyTestName(name: string | null | undefined): boolean {
  return (name ?? '').trim().startsWith('테스트');
}

/** 모든 집계에서 빼야 하는가 (테스트·내부 계정 또는 중복) */
export function isFullyExcluded(a: ExcludableApplicant): boolean {
  const r = a.excluded_reason;
  return isLegacyTestName(a.name) || r === 'test' || r === 'duplicate';
}

/** 선발 후보에서 빼야 하는가 (완전 제외 + 대상 아님) */
export function isSelectionExcluded(a: ExcludableApplicant): boolean {
  return isFullyExcluded(a) || a.excluded_reason === 'not_eligible';
}

/** 화면 뱃지용 — 표시할 예외 사유. 없으면 null */
export function exclusionBadge(a: ExcludableApplicant): ExclusionReason | null {
  if (isReason(a.excluded_reason)) return a.excluded_reason;
  return isLegacyTestName(a.name) ? 'test' : null;
}

// ── 자동 감지 (확정이 아니라 "검토 필요" 후보 제시용) ────────────────────
//
// 실측 결과 기관명만으로 판정하면 오탐이 심하다 — 대학 패턴에 걸린 20명 중
// 15명이 국립대병원·경찰대학 같은 정상 공공기관이었다. 그래서 자동 제외는
// 하지 않고, 운영자가 확인할 후보만 표시한다.

/** 이름에 대학이 들어가지만 공공기관인 곳 (국립대병원·경찰대학·폴리텍 등) */
const PUBLIC_DESPITE_PATTERN =
  /병원|경찰대학|폴리텍|시립대|도립대|교원대학교|과학기술원|한국전력국제원자력/;

const PRIVATE_ORG_PATTERN = /대학교|대학$|캠퍼스|사단법인|\(사\)|의료법인|학교법인|산학협력단/;

/** 내부·테스트 계정으로 쓰이는 사내 메일 도메인 */
const INTERNAL_MAIL_PATTERN = /@(kbrainc|daeasy)\./i;

export type ExclusionHint = { reason: ExclusionReason; note: string };

/** 예외 후보 감지. null 이면 특이사항 없음. 확정이 아니라 검토 제안일 뿐. */
export function detectExclusionHint(input: {
  organizationName?: string | null;
  email?: string | null;
  personalEmail?: string | null;
}): ExclusionHint | null {
  const mail = `${input.email ?? ''} ${input.personalEmail ?? ''}`;
  if (INTERNAL_MAIL_PATTERN.test(mail)) {
    return { reason: 'test', note: '사내 메일 도메인 — 내부·테스트 계정으로 보임' };
  }
  const org = (input.organizationName ?? '').trim();
  if (!org) return null;
  if (PUBLIC_DESPITE_PATTERN.test(org)) return null;
  if (PRIVATE_ORG_PATTERN.test(org)) {
    return { reason: 'not_eligible', note: `${org} — 공공부문 소속 여부 확인 필요` };
  }
  return null;
}
