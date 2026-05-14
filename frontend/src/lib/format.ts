export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {}
) {
  if (!date) return '';

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: opts.month ?? 'long',
      day: opts.day ?? 'numeric',
      year: opts.year ?? 'numeric',
      ...opts
    }).format(new Date(date));
  } catch {
    return '';
  }
}

/**
 * KST(UTC+9) 기준 오늘의 YYYY-MM-DD 문자열.
 * `new Date().toISOString().split('T')[0]`은 UTC라 자정~9시 사이에 어제로 잡힘.
 * Server Component의 cohort 일정 비교, today 변수에 항상 사용.
 */
export function todayKst(): string {
  const now = new Date();
  // KST = UTC + 9시간
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
