import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { cohorts, sessions, attendanceRecords, students } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { Icons } from '@/components/icons';
import { CreateSessionSheet } from './_components/create-session-sheet';
import { BulkCreateSessionSheet } from './_components/bulk-create-session-sheet';
import { SessionList } from './_components/session-list';

export default async function AttendancePage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;

  const cohortRows = await db
    .select({ id: cohorts.id })
    .from(cohorts)
    .where(eq(cohorts.id, cohortId))
    .limit(1);

  if (!cohortRows[0]) notFound();

  try {
    // Fetch sessions
    const sessionRows = await db
      .select({
        id: sessions.id,
        session_date: sessions.sessionDate,
        title: sessions.title,
        start_time: sessions.startTime,
        end_time: sessions.endTime,
        break_minutes: sessions.breakMinutes,
        break_start_time: sessions.breakStartTime,
        break_end_time: sessions.breakEndTime
      })
      .from(sessions)
      .where(eq(sessions.cohortId, cohortId));

    // Fetch attendance records with student names for those sessions
    const sessionIds = sessionRows.map((s) => s.id);
    let recordRows: { sessionId: string; status: string; studentName: string | null }[] = [];
    if (sessionIds.length > 0) {
      recordRows = await db
        .select({
          sessionId: attendanceRecords.sessionId,
          status: attendanceRecords.status,
          studentName: students.name
        })
        .from(attendanceRecords)
        .leftJoin(students, eq(attendanceRecords.studentId, students.id))
        .where(
          sessionIds.length === 1
            ? eq(attendanceRecords.sessionId, sessionIds[0])
            : inArray(attendanceRecords.sessionId, sessionIds)
        );
    }

    // Group records by session and map to expected shape
    const recordsBySession = new Map<string, { status: string; students: { name: string } | null }[]>();
    for (const r of recordRows) {
      if (!recordsBySession.has(r.sessionId)) {
        recordsBySession.set(r.sessionId, []);
      }
      recordsBySession.get(r.sessionId)!.push({
        status: r.status,
        students: r.studentName ? { name: r.studentName } : null
      });
    }

    const raw = sessionRows.map((s) => ({
      ...s,
      attendance_records: recordsBySession.get(s.id) ?? []
    }));

    const today = new Date().toISOString().split('T')[0];

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
