/**
 * PostgREST의 server-side `max_rows` 기본값(1000)을 우회해 모든 row를 가져온다.
 * `.range(0, 49999)`만으로는 부족 — 클라이언트에서 1000건씩 페이지네이션 필수.
 */
export async function fetchAllPages<T>(
  build: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}
