import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
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
                return (
                  <TableRow key={s.id}>
                    <TableCell className='font-mono text-sm'>{s.session_date}</TableCell>
                    <TableCell className='font-medium'>{s.title ?? '—'}</TableCell>
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
