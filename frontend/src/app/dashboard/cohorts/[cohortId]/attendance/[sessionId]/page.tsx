import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { sessions, students, organizations, attendanceRecords } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
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

  const [sessionRows, studentRows, recordRows] = await Promise.all([
    db
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
      .where(eq(sessions.id, sessionId))
      .limit(1),
    db
      .select({
        id: students.id,
        name: students.name,
        orgName: organizations.name
      })
      .from(students)
      .leftJoin(organizations, eq(students.organizationId, organizations.id))
      .where(eq(students.cohortId, cohortId))
      .orderBy(asc(students.name)),
    db
      .select({
        student_id: attendanceRecords.studentId,
        status: attendanceRecords.status,
        note: attendanceRecords.note,
        arrival_time: attendanceRecords.arrivalTime,
        departure_time: attendanceRecords.departureTime,
        credited_hours: attendanceRecords.creditedHours
      })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, sessionId))
  ]);

  const session = sessionRows[0];
  if (!session) notFound();

  // Map students to expected shape: organizations as { name: string } | null
  const mappedStudents = studentRows.map((s) => ({
    id: s.id,
    name: s.name,
    organizations: s.orgName ? { name: s.orgName } : null
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
