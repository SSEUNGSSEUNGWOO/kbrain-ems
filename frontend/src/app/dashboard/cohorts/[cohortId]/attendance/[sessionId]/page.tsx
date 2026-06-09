import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { AttendanceTable } from './_components/attendance-table';
import { AttendanceChecksSection } from './_components/attendance-checks-section';

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
    applicants: { category: string | null } | null;
  };

  type CheckRow = {
    id: string;
    label: string;
    share_code: string | null;
    opens_at: string | null;
    closes_at: string | null;
    criterion_at: string | null;
    attendance_role: string | null;
    display_order: number;
    attendance_check_records: {
      student_id: string;
      checked_at: string;
      students: { name: string } | null;
    }[];
  };

  const [sessionRes, studentRes, recordRes, checkRes] = await Promise.all([
    supabase
      .from('sessions')
      .select(
        'id, session_date, title, start_time, end_time, break_minutes, break_start_time, break_end_time'
      )
      .eq('id', sessionId)
      .limit(1),
    supabase
      .from('students')
      .select('id, name, organizations(name), applicants(category)')
      .eq('cohort_id', cohortId)
      .order('name', { ascending: true })
      .returns<StudentRow[]>(),
    supabase
      .from('attendance_records')
      .select('student_id, status, note, arrival_time, departure_time, credited_hours')
      .eq('session_id', sessionId),
    supabase
      .from('attendance_checks')
      .select(
        'id, label, share_code, opens_at, closes_at, criterion_at, attendance_role, display_order, attendance_check_records(student_id, checked_at, students(name))'
      )
      .eq('session_id', sessionId)
      .order('display_order', { ascending: true })
      .returns<CheckRow[]>()
  ]);

  if (sessionRes.error) throw new Error(sessionRes.error.message);
  if (studentRes.error) throw new Error(studentRes.error.message);
  if (recordRes.error) throw new Error(recordRes.error.message);
  if (checkRes.error) throw new Error(checkRes.error.message);

  const session = sessionRes.data?.[0];
  if (!session) notFound();

  const studentRows = studentRes.data ?? [];
  const recordRows = recordRes.data ?? [];

  // 테스트 학생(이름이 '테스트'로 시작)은 실제 학생 뒤로 정렬
  const sortedStudentRows = [...studentRows].sort((a, b) => {
    const aTest = a.name.startsWith('테스트');
    const bTest = b.name.startsWith('테스트');
    if (aTest !== bTest) return aTest ? 1 : -1;
    return a.name.localeCompare(b.name, 'ko');
  });

  // Map students to expected shape: organizations as { name: string } | null
  const mappedStudents = sortedStudentRows.map((s) => ({
    id: s.id,
    name: s.name,
    organizations: s.organizations ? { name: s.organizations.name } : null,
    category: s.applicants?.category ?? null
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

  const checks = (checkRes.data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    share_code: c.share_code,
    opens_at: c.opens_at,
    closes_at: c.closes_at,
    criterion_at: c.criterion_at,
    attendance_role: c.attendance_role,
    records: (c.attendance_check_records ?? []).map((r) => ({
      student_id: r.student_id,
      checked_at: r.checked_at,
      students: r.students
    }))
  }));

  return (
    <PageContainer
      pageTitle={title}
      pageDescription={[timeDesc, `총 ${mappedStudents.length}명`].filter(Boolean).join(' · ')}
    >
      <div className='space-y-6'>
        <AttendanceChecksSection
          cohortId={cohortId}
          sessionId={sessionId}
          sessionDate={session.session_date}
          students={mappedStudents.map((s) => ({ id: s.id, name: s.name }))}
          checks={checks}
        />
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
      </div>
    </PageContainer>
  );
}
