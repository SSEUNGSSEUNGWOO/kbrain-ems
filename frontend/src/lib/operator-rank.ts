const RANK: Record<string, number> = {
  본부장: 0,
  부본부장: 1,
  팀장: 2,
  주임: 3
};

export function operatorRank(title: string | null | undefined): number {
  if (!title) return 99;
  return RANK[title] ?? 99;
}

export function compareOperators(
  a: { title: string | null; name: string },
  b: { title: string | null; name: string }
): number {
  const diff = operatorRank(a.title) - operatorRank(b.title);
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name, 'ko');
}
