import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { LessonsTable, type LessonRow } from './_components/lessons-table';

type Props = {
  params: Promise<{ cohortId: string }>;
  searchParams: Promise<{ order?: string }>;
};

export default async function LessonsPage({ params, searchParams }: Props) {
  const { cohortId } = await params;
  const { order } = await searchParams;
  // 기본: 오름차순 (빠른 날짜 → 늦은 날짜). ?order=desc 명시 시 역순.
  const ascending = order !== 'desc';
  const supabase = createAdminClient();

  const { data: sessions } = await supabase
    .from('sessions')
    .select(
      'id, session_date, session_end_date, title, locations(name), session_instructors(instructor_id, role, instructors(id, name))'
    )
    .eq('cohort_id', cohortId)
    .order('session_date', { ascending });

  type SessionRow = {
    id: string;
    session_date: string;
    session_end_date: string | null;
    title: string | null;
    locations: { name: string } | null;
    session_instructors: {
      instructor_id: string;
      role: string;
      instructors: { id: string; name: string } | null;
    }[];
  };

  const rawRows = (sessions ?? []) as unknown as SessionRow[];

  // 출결 입력 진척률 + 과제 유무 — 모든 session_id 일괄 fetch
  const sessionIds = rawRows.map((s) => s.id);
  const progressBySessionId = new Map<string, { filled: number; total: number }>();
  const assignmentCountBySessionId = new Map<string, number>();
  if (sessionIds.length > 0) {
    const [attRes, assignRes] = await Promise.all([
      supabase.from('attendance_records').select('session_id, status').in('session_id', sessionIds),
      supabase.from('assignments').select('session_id').in('session_id', sessionIds)
    ]);
    for (const r of attRes.data ?? []) {
      const cur = progressBySessionId.get(r.session_id) ?? { filled: 0, total: 0 };
      cur.total++;
      if (r.status && r.status !== 'none') cur.filled++;
      progressBySessionId.set(r.session_id, cur);
    }
    for (const r of assignRes.data ?? []) {
      if (!r.session_id) continue;
      assignmentCountBySessionId.set(
        r.session_id,
        (assignmentCountBySessionId.get(r.session_id) ?? 0) + 1
      );
    }
  }

  const rows: LessonRow[] = rawRows.map((s) => {
    const mainNames = s.session_instructors
      .filter((si) => si.instructors && (si.role ?? 'main') === 'main')
      .map((si) => si.instructors!.name);
    const subNames = s.session_instructors
      .filter((si) => si.instructors && si.role === 'sub')
      .map((si) => si.instructors!.name);
    const instructorNames = mainNames.length > 0 ? mainNames.join(', ') : '—';
    const assistantNames = subNames.length > 0 ? subNames.join(', ') : '—';
    const prog = progressBySessionId.get(s.id);
    const isComplete = prog ? prog.total > 0 && prog.filled === prog.total : false;
    const pct = prog && prog.total > 0 ? Math.round((prog.filled / prog.total) * 100) : 0;
    return {
      id: s.id,
      session_date: s.session_date,
      title: s.title,
      locationName: s.locations?.name ?? null,
      instructorNames,
      assistantNames,
      isComplete,
      pct,
      prog,
      assignmentCount: assignmentCountBySessionId.get(s.id) ?? 0
    };
  });

  return (
    <PageContainer
      pageTitle='수업'
      pageDescription={`총 ${rows.length}개 수업 (회차)`}
      pageHeaderAction={
        <Link href={`/dashboard/cohorts/${cohortId}/lessons/new`}>
          <Button>+ 새 수업</Button>
        </Link>
      }
    >
      {rows.length === 0 ? (
        <div className='text-muted-foreground rounded-xl border bg-card px-6 py-12 text-center'>
          등록된 수업이 없습니다. 우상단 &quot;+ 새 수업&quot; 버튼으로 추가하세요.
        </div>
      ) : (
        <LessonsTable cohortId={cohortId} rows={rows} ascending={ascending} />
      )}
    </PageContainer>
  );
}
