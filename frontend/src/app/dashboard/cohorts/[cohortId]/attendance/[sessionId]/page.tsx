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
    phone: string | null;
    applicant_id: string | null;
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

  const [sessionRes, studentRes, recordRes, checkRes, appRes] = await Promise.all([
    supabase
      .from('sessions')
      .select(
        'id, session_date, title, start_time, end_time, break_minutes, break_start_time, break_end_time'
      )
      .eq('id', sessionId)
      .limit(1),
    supabase
      .from('students')
      .select('id, name, phone, applicant_id, organizations(name), applicants(category)')
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
      .returns<CheckRow[]>(),
    supabase
      .from('applications')
      .select('applicant_id, status')
      .eq('cohort_id', cohortId)
  ]);

  if (sessionRes.error) throw new Error(sessionRes.error.message);
  if (studentRes.error) throw new Error(studentRes.error.message);
  if (recordRes.error) throw new Error(recordRes.error.message);
  if (checkRes.error) throw new Error(checkRes.error.message);
  if (appRes.error) throw new Error(appRes.error.message);

  const session = sessionRes.data?.[0];
  if (!session) notFound();

  // 취하·탈락된 신청자만 명단에서 제외. application 자체가 없는 학생
  // (테스트·수동등록 등)은 통과. 매칭 키는 students.applicant_id ↔ applications.applicant_id.
  // 'selected' 외 'same_day_cancel'(당일취소)도 출결판에 표시 (당일취소 뱃지로 구분).
  // 'pre_cancel'(사전취소)·'rejected' 는 출결에서 제외.
  const appStatusByApplicant = new Map(
    (appRes.data ?? []).map((a) => [a.applicant_id, a.status])
  );
  const studentRows = (studentRes.data ?? []).filter((s) => {
    if (!s.applicant_id) return true;
    const status = appStatusByApplicant.get(s.applicant_id);
    if (!status) return true;
    return status === 'selected' || status === 'same_day_cancel';
  });
  const recordRows = recordRes.data ?? [];

  // 정렬 그룹: 정상 → 당일취소 → 테스트. 각 그룹 안에선 이름 순.
  const groupOf = (s: { name: string; applicant_id: string | null }): 0 | 1 | 2 => {
    if (s.name.startsWith('테스트')) return 2;
    const status = s.applicant_id ? appStatusByApplicant.get(s.applicant_id) : null;
    if (status === 'same_day_cancel') return 1;
    return 0;
  };
  const sortedStudentRows = [...studentRows].sort((a, b) => {
    const ga = groupOf(a);
    const gb = groupOf(b);
    if (ga !== gb) return ga - gb;
    return a.name.localeCompare(b.name, 'ko');
  });

  // Map students to expected shape: organizations as { name: string } | null
  const mappedStudents = sortedStudentRows.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    organizations: s.organizations ? { name: s.organizations.name } : null,
    category: s.applicants?.category ?? null,
    applicationStatus: s.applicant_id ? appStatusByApplicant.get(s.applicant_id) ?? null : null
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

  // 이 세션의 체크포인트에 연결된 진단들 (학생 줄에 진행 상태 뱃지 표시용)
  const checkIds = checks.map((c) => c.id);
  type LinkedDiag = {
    id: string;
    type: string;
    duration_minutes: number;
  };
  type DiagResp = {
    diagnosis_id: string;
    student_id: string | null;
    started_at: string | null;
    submitted_at: string | null;
  };
  let diagProgress: Record<string, { type: string; startedAt: string | null; submittedAt: string | null; durationMinutes: number }[]> = {};
  if (checkIds.length > 0) {
    const { data: linkedDiagnoses } = await supabase
      .from('diagnoses')
      .select('id, type, duration_minutes')
      .in('attendance_check_id', checkIds)
      .returns<LinkedDiag[]>();
    const diagIds = (linkedDiagnoses ?? []).map((d) => d.id);
    if (diagIds.length > 0) {
      const { data: diagResponses } = await supabase
        .from('diagnosis_responses')
        .select('diagnosis_id, student_id, started_at, submitted_at')
        .in('diagnosis_id', diagIds)
        .returns<DiagResp[]>();
      const diagById = new Map((linkedDiagnoses ?? []).map((d) => [d.id, d]));
      for (const r of diagResponses ?? []) {
        if (!r.student_id) continue;
        const d = diagById.get(r.diagnosis_id);
        if (!d) continue;
        const arr = diagProgress[r.student_id] ?? [];
        arr.push({
          type: d.type,
          startedAt: r.started_at,
          submittedAt: r.submitted_at,
          durationMinutes: d.duration_minutes
        });
        diagProgress[r.student_id] = arr;
      }
    }
  }

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
          students={mappedStudents.map((s) => ({
            id: s.id,
            name: s.name,
            phone: s.phone,
            org_name: s.organizations?.name ?? null
          }))}
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
          diagnosisProgress={diagProgress}
        />
      </div>
    </PageContainer>
  );
}
