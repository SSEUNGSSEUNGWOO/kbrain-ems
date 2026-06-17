import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { AssistantsMatrix } from './_components/assistants-matrix';

type Props = {
  searchParams: Promise<{ ym?: string }>;
};

export const dynamic = 'force-dynamic';

function ymFromSearch(ym: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (ym) {
    const m = ym.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      if (mo >= 1 && mo <= 12) return { year: y, month: mo };
    }
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  // 다음 달 1일 직전 = 이번 달 끝.
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start, end: next };
}

export default async function AssistantsPage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const { year, month } = ymFromSearch(ym);
  const { start, end } = monthRange(year, month);

  const supabase = createAdminClient();

  const [assistantsRes, sessionsRes] = await Promise.all([
    supabase
      .from('instructors')
      .select('id, name')
      .eq('kind', 'sub')
      .order('name'),
    supabase
      .from('sessions')
      .select(
        'id, session_date, title, cohort_id, cohorts(name), session_instructors(instructor_id, role)'
      )
      .gte('session_date', start)
      .lt('session_date', end)
      .order('session_date', { ascending: true })
  ]);

  const assistants = assistantsRes.data ?? [];

  type SessionRow = {
    id: string;
    session_date: string;
    title: string | null;
    cohort_id: string;
    cohorts: { name: string } | null;
    session_instructors: { instructor_id: string; role: string | null }[];
  };
  const sessions = ((sessionsRes.data ?? []) as unknown as SessionRow[]).map((s) => {
    const subIds = new Set(
      s.session_instructors.filter((si) => si.role === 'sub').map((si) => si.instructor_id)
    );
    return {
      id: s.id,
      session_date: s.session_date,
      title: s.title ?? '',
      cohortId: s.cohort_id,
      cohortName: s.cohorts?.name ?? '',
      assignedAssistantIds: Array.from(subIds)
    };
  });

  // 인원별 배정 건수 (이번 달 기준)
  const countById = new Map<string, number>();
  for (const s of sessions) {
    for (const id of s.assignedAssistantIds) {
      countById.set(id, (countById.get(id) ?? 0) + 1);
    }
  }
  const assistantsWithCount = assistants.map((a) => ({
    id: a.id,
    name: a.name,
    count: countById.get(a.id) ?? 0
  }));

  return (
    <PageContainer
      pageTitle='보조강사 배정'
      pageDescription='월별 회차별 보조강사 배정 · 클릭으로 즉시 저장'
    >
      <AssistantsMatrix
        year={year}
        month={month}
        assistants={assistantsWithCount}
        sessions={sessions}
      />
    </PageContainer>
  );
}
