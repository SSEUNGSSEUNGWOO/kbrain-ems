import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createClient } from '@/lib/supabase/server';
import { CreateSessionSheet } from './_components/create-session-sheet';
import { BulkCreateSessionSheet } from './_components/bulk-create-session-sheet';
import { SessionList } from './_components/session-list';

export default async function AttendancePage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id')
    .eq('id', cohortId)
    .single();

  if (!cohort) notFound();

  const { data: raw, error } = await supabase
    .from('sessions')
    .select('id, session_date, title, start_time, end_time, break_minutes, attendance_records(status, students(name))')
    .eq('cohort_id', cohortId);

  if (error) {
    return (
      <PageContainer pageTitle='출결'>
        <div className='text-destructive'>
          출결 목록을 불러오지 못했습니다: {error.message}
        </div>
      </PageContainer>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  // 미래(오늘 포함): 오름차순 / 과거: 내림차순(최근이 위)으로 정렬 후 합치기
  const future = (raw ?? [])
    .filter((s) => s.session_date >= today)
    .sort((a, b) => a.session_date.localeCompare(b.session_date));
  const past = (raw ?? [])
    .filter((s) => s.session_date < today)
    .sort((a, b) => b.session_date.localeCompare(a.session_date));

  const sessions = [...future, ...past];

  return (
    <PageContainer
      pageTitle='출결'
      pageDescription='수업 회차별 출결 현황을 관리합니다.'
      pageHeaderAction={
        <div className='flex gap-2'>
          <BulkCreateSessionSheet cohortId={cohortId} />
          <CreateSessionSheet cohortId={cohortId} />
        </div>
      }
    >
      {sessions.length === 0 ? (
        <div className='text-muted-foreground rounded-md border p-8 text-center'>
          등록된 수업이 없습니다. 우측 상단 [+ 수업 추가]로 등록해주세요.
        </div>
      ) : (
        <SessionList cohortId={cohortId} sessions={sessions} pastStartIndex={future.length} />
      )}
    </PageContainer>
  );
}
