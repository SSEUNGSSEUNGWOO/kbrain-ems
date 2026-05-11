/**
 * 운영자별 cohort 정렬 헬퍼.
 *
 * order 배열에 있는 cohort id 순서대로 먼저 배치하고,
 * 배열에 없는 (새로 만들어진) cohort는 끝에 created_at 내림차순으로 붙인다.
 */
export function sortCohortsByPreference<T extends { id: string; created_at: string }>(
  cohorts: T[],
  order: string[]
): T[] {
  const orderSet = new Set(order);
  const cohortMap = new Map(cohorts.map((c) => [c.id, c]));

  const ordered: T[] = [];
  for (const id of order) {
    const c = cohortMap.get(id);
    if (c) ordered.push(c);
  }

  const rest = cohorts
    .filter((c) => !orderSet.has(c.id))
    .toSorted((a, b) => b.created_at.localeCompare(a.created_at));

  return [...ordered, ...rest];
}
