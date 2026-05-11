import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { AttendanceTable } from './_components/attendance-table';

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const dow = DOW[new Date(`${dateStr}T00:00:00`).getDay()];
  return `${y}년 ${m}월 ${d}일 (${dow})`;
}

export default async function SessionAttendancePage({
  params
}: {
  params: Promise<{ cohortId: string; sessionId: string }>;
}) {
  const { cohortId, sessionId } = await params;
  const supabase = createAdminClient();

  type StudentRow = {
    id: string;
    name: string;
    organizations: { name: string } | null;
  };

  const [sessionRes, studentRes, recordRes] = await Promise.all([
    supabase
      .from('sessions')
      .select(
        'id, session_date, title, start_time, end_time, break_minutes, break_start_time, break_end_time'
      )
      .eq('id', sessionId)
      .limit(1),
    supabase
      .from('students')
      .select('id, name, organizations(name)')
      .eq('cohort_id', cohortId)
      .order('name', { ascending: true })
      .returns<StudentRow[]>(),
    supabase
      .from('attendance_records')
      .select('student_id, status, note, arrival_time, departure_time, credited_hours')
      .eq('session_id', sessionId)
  ]);

  if (sessionRes.error) throw new Error(sessionRes.error.message);
  if (studentRes.error) throw new Error(studentRes.error.message);
  if (recordRes.error) throw new Error(recordRes.error.message);

  const session = sessionRes.data?.[0];
  if (!session) notFound();

  const studentRows = studentRes.data ?? [];
  const recordRows = recordRes.data ?? [];

  // Map students to expected shape: organizations as { name: string } | null
  const mappedStudents = studentRows.map((s) => ({
    id: s.id,
    name: s.name,
    organizations: s.organizations ? { name: s.organizations.name } : null
  }));

  const recordMap = Object.fromEntries(
    recordRows.map((r) => [
      r.student_id,
      {
        status: r.status,
        note: r.note,
        arrival_time: r.arrival_time,
        departure_time: r.departure_time,
        credited_hours: r.credited_hours ? Number(r.credited_hours) : null
      }
    ])
  );

  const title = session.title
    ? `${session.title} (${formatDate(session.session_date)})`
    : formatDate(session.session_date);

  const breakMin = session.break_minutes ?? 0;
  const timeDesc = session.start_time && session.end_time
    ? `${session.start_time.slice(0, 5)} ~ ${session.end_time.slice(0, 5)}${breakMin > 0 ? ` (휴식 ${breakMin}분)` : ''}`
    : null;

  return (
    <PageContainer
      pageTitle={title}
      pageDescription={[timeDesc, `총 ${mappedStudents.length}명`].filter(Boolean).join(' · ')}
    >
      <AttendanceTable
        sessionId={sessionId}
        cohortId={cohortId}
        students={mappedStudents}
        recordMap={recordMap}
        sessionStartTime={session.start_time?.slice(0, 5) ?? null}
        sessionEndTime={session.end_time?.slice(0, 5) ?? null}
        breakMinutes={breakMin}
        breakStartTime={session.break_start_time?.slice(0, 5) ?? null}
      />
    </PageContainer>
  );
}
