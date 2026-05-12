import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { LessonRowActions } from './_components/lesson-row-actions';

type Props = {
  params: Promise<{ cohortId: string }>;
};

export default async function LessonsPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const { data: sessions } = await supabase
    .from('sessions')
    .select(
      'id, session_date, title, locations(name), session_instructors(instructor_id, role, instructors(id, name))'
    )
    .eq('cohort_id', cohortId)
    .order('session_date', { ascending: false });

  type SessionRow = {
    id: string;
    session_date: string;
    title: string | null;
    locations: { name: string } | null;
    session_instructors: {
      instructor_id: string;
      role: string;
      instructors: { id: string; name: string } | null;
    }[];
  };

  const rows = (sessions ?? []) as unknown as SessionRow[];

  // 출결 입력 진척률 + 과제 유무 — 모든 session_id 일괄 fetch
  const sessionIds = rows.map((s) => s.id);
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
        <div className='rounded-xl border bg-card px-6 py-12 text-center text-muted-foreground'>
          등록된 수업이 없습니다. 우상단 "+ 새 수업" 버튼으로 추가하세요.
        </div>
      ) : (
        <div className='rounded-xl border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-12 text-center'>완료</TableHead>
                <TableHead className='w-12 text-center'>과제</TableHead>
                <TableHead className='w-32'>날짜</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className='w-40'>장소</TableHead>
                <TableHead>강사</TableHead>
                <TableHead className='w-28 text-right'>관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const instructorNames =
                  s.session_instructors
                    .filter((si) => si.instructors)
                    .map((si) => si.instructors!.name)
                    .join(', ') || '—';
                const prog = progressBySessionId.get(s.id);
                const isComplete = prog ? prog.total > 0 && prog.filled === prog.total : false;
                const pct = prog && prog.total > 0 ? Math.round((prog.filled / prog.total) * 100) : 0;
                const assignmentCount = assignmentCountBySessionId.get(s.id) ?? 0;
                const detailHref = `/dashboard/cohorts/${cohortId}/lessons/${s.id}`;
                return (
                  <TableRow key={s.id} className='hover:bg-muted/40'>
                    <TableCell className='text-center'>
                      <ProgressIndicator complete={isComplete} pct={pct} prog={prog} />
                    </TableCell>
                    <TableCell className='text-center'>
                      <AssignmentIndicator count={assignmentCount} />
                    </TableCell>
                    <TableCell className='font-mono text-sm'>
                      <Link href={detailHref} className='hover:underline'>
                        {s.session_date}
                      </Link>
                    </TableCell>
                    <TableCell className='font-medium'>
                      <Link href={detailHref} className='hover:underline'>
                        {s.title ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {s.locations?.name ?? '—'}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>{instructorNames}</TableCell>
                    <TableCell className='text-right'>
                      <LessonRowActions cohortId={cohortId} sessionId={s.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}

function AssignmentIndicator({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span
        title='연결된 과제 없음'
        className='inline-flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-[10px] text-muted-foreground/40'
      >
        −
      </span>
    );
  }
  return (
    <span
      title={`연결된 과제 ${count}개`}
      className='inline-flex items-center justify-center gap-0.5'
    >
      <Icons.circleCheck className='h-5 w-5 text-amber-600 dark:text-amber-400' />
      {count > 1 && (
        <span className='text-[10px] font-bold text-amber-700 dark:text-amber-400'>{count}</span>
      )}
    </span>
  );
}

function ProgressIndicator({
  complete,
  pct,
  prog
}: {
  complete: boolean;
  pct: number;
  prog: { filled: number; total: number } | undefined;
}) {
  const title = prog
    ? `출결 입력 ${prog.filled}/${prog.total} (${pct}%)`
    : '출결 데이터 없음';

  if (complete) {
    return (
      <span title={title} className='inline-flex items-center justify-center'>
        <Icons.circleCheck className='h-5 w-5 text-emerald-600 dark:text-emerald-400' />
      </span>
    );
  }
  return (
    <span
      title={title}
      className='inline-flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/40 text-[9px] font-bold text-muted-foreground'
    >
      {pct > 0 ? `${pct}` : ''}
    </span>
  );
}
