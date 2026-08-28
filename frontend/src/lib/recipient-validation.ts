// 문자 발송 대상자 검증·정리.
//
// 명단은 엑셀 업로드와 지원서 접수를 거쳐 들어오므로 형식이 고르지 않다. 하이픈이 있기도
// 없기도 하고, 번호가 비어 있거나 두 사람이 같은 번호를 쓰기도 한다. 그대로 타스온에 넘기면
// 에러 41(wrong sender data or blank receiver data)로 배치 전체가 거부되거나, 같은 번호로
// 두 통이 나가고 요금도 두 번 나온다.
//
// 전화번호 규칙은 지원서 접수(app/apply/[slug]/_actions.ts)와 같은 것을 쓴다. 두 곳이 다르면
// 접수 때 통과한 번호가 발송 때 걸린다.

/** 접수 폼과 동일. 010/011/016/017/018/019 + 3~4자리 + 4자리. */
const PHONE_RE = /^(01[016789])-?(\d{3,4})-?(\d{4})$/;

/** 타스온 콘솔 기준 1회 100건. API 상한은 문의 중이라 보수적으로 콘솔 값을 쓴다. */
export const BATCH_SIZE = 100;

export type ExclusionReason = 'missing' | 'malformed' | 'duplicate';

export type RecipientInput = {
  id: string;
  name: string;
  phone: string | null;
};

export type ValidRecipient = RecipientInput & {
  /** 하이픈 정규화형 (010-1234-5678). 사람이 읽는 화면·이력용. */
  phone: string;
  /** 하이픈 없는 숫자열. 타스온에 넘기는 형태. */
  phoneDigits: string;
};

export type ExcludedRecipient = RecipientInput & {
  reason: ExclusionReason;
  /** duplicate 일 때 누구와 겹쳤는지 — 사람이 판단할 수 있게 남긴다. */
  duplicateOf?: string;
};

export type RecipientReview = {
  valid: ValidRecipient[];
  excluded: ExcludedRecipient[];
  /** valid 를 BATCH_SIZE 로 자른 것. 발송은 이 단위로 나간다. */
  batches: ValidRecipient[][];
};

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  missing: '번호 없음',
  malformed: '번호 형식 오류',
  duplicate: '번호 중복'
};

/** 접수 폼과 동일한 정규화. 10자리·11자리만 하이픈을 넣고 나머지는 원본을 돌려준다. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return input;
}

/**
 * 발송 대상을 걸러 배치로 나눈다.
 *
 * 중복은 먼저 나온 사람을 남기고 뒤를 뺀다. 순서가 결과를 바꾸므로 호출부에서 정렬을
 * 고정해 두어야 화면과 실제 발송이 일치한다.
 */
export function reviewRecipients(recipients: readonly RecipientInput[]): RecipientReview {
  const valid: ValidRecipient[] = [];
  const excluded: ExcludedRecipient[] = [];
  const seen = new Map<string, string>(); // phoneDigits → 먼저 차지한 사람 이름

  for (const r of recipients) {
    const raw = (r.phone ?? '').trim();
    if (!raw) {
      excluded.push({ ...r, reason: 'missing' });
      continue;
    }

    const normalized = normalizePhone(raw);
    if (!PHONE_RE.test(normalized)) {
      excluded.push({ ...r, reason: 'malformed' });
      continue;
    }

    const digits = normalized.replace(/\D/g, '');
    const owner = seen.get(digits);
    if (owner !== undefined) {
      excluded.push({ ...r, reason: 'duplicate', duplicateOf: owner });
      continue;
    }

    seen.set(digits, r.name);
    valid.push({ ...r, phone: normalized, phoneDigits: digits });
  }

  const batches: ValidRecipient[][] = [];
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    batches.push(valid.slice(i, i + BATCH_SIZE));
  }

  return { valid, excluded, batches };
}
