import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { todayKst } from '@/lib/format';
import { CreateSessionSheet } from './_components/create-session-sheet';
import { BulkCreateSessionSheet } from './_components/bulk-create-session-sheet';
import { SessionList } from './_components/session-list';

export default async function AttendancePage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const { data: cohortRows, error: cohortError } = await supabase
    .from('cohorts')
    .select('id')
    .eq('id', cohortId)
    .limit(1);
  if (cohortError) {
    return (
      <PageContainer pageTitle='출결'>
        <div className='text-destructive'>
          출결 목록을 불러오지 못했습니다: {cohortError.message}
        </div>
      </PageContainer>
    );
  }
  if (!cohortRows?.[0]) notFound();

  try {
    // Fetch sessions
    const { data: sessionRows, error: sessionError } = await supabase
      .from('sessions')
      .select(
        'id, session_date, title, start_time, end_time, break_minutes, break_start_time, break_end_time'
      )
      .eq('cohort_id', cohortId);
    if (sessionError) throw new Error(sessionError.message);

    const sessions = sessionRows ?? [];

    // Fetch attendance records with student names for those sessions
    const sessionIds = sessions.map((s) => s.id);
    type RecordRow = {
      session_id: string;
      status: string;
      students: { name: string } | null;
    };
    let recordRows: RecordRow[] = [];
    if (sessionIds.length > 0) {
      const { data, error: recordError } = await supabase
        .from('attendance_records')
        .select('session_id, status, students(name)')
        .in('session_id', sessionIds)
        .returns<RecordRow[]>();
      if (recordError) throw new Error(recordError.message);
      recordRows = data ?? [];
    }

    // Group records by session and map to expected shape
    const recordsBySession = new Map<string, { status: string; students: { name: string } | null }[]>();
    for (const r of recordRows) {
      if (!recordsBySession.has(r.session_id)) {
        recordsBySession.set(r.session_id, []);
      }
      recordsBySession.get(r.session_id)!.push({
        status: r.status,
        students: r.students ? { name: r.students.name } : null
      });
    }

    const raw = sessions.map((s) => ({
      ...s,
      attendance_records: recordsBySession.get(s.id) ?? []
    }));

    const today = todayKst();

    const future = raw
      .filter((s) => s.session_date >= today)
      .sort((a, b) => a.session_date.localeCompare(b.session_date));
    const past = raw
      .filter((s) => s.session_date < today)
      .sort((a, b) => b.session_date.localeCompare(a.session_date));

    const allSessions = [...future, ...past];

    return (
      <PageContainer
        pageTitle='출결'
        pageDescription='수업 회차별 출결 현황을 관리합니다.'
        pageHeaderAction={
          <div className='flex gap-2'>
            <Button variant='outline' asChild>
              <a href={`/api/cohorts/${cohortId}/attendance/export`}>
                엑셀 다운로드
              </a>
            </Button>
            <BulkCreateSessionSheet cohortId={cohortId} />
            <CreateSessionSheet cohortId={cohortId} />
          </div>
        }
      >
        {allSessions.length === 0 ? (
          <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
            <div className='mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40'>
              <Icons.calendar className='h-6 w-6 text-emerald-500' />
            </div>
            <p className='text-foreground mb-1 font-medium'>등록된 수업이 없습니다</p>
            <p className='text-muted-foreground text-sm'>우측 상단에서 수업을 추가해주세요.</p>
          </div>
        ) : (
          <SessionList cohortId={cohortId} sessions={allSessions} pastStartIndex={future.length} />
        )}
      </PageContainer>
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    return (
      <PageContainer pageTitle='출결'>
        <div className='text-destructive'>
          출결 목록을 불러오지 못했습니다: {message}
        </div>
      </PageContainer>
    );
  }
}
