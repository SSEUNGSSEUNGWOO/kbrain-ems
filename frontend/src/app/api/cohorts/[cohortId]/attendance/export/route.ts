import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { buildAttendanceWorkbook } from '@/lib/excel/attendance-export';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const { data: cohortRows, error: cohortError } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('id', cohortId)
    .limit(1);

  if (cohortError) {
    return new NextResponse(cohortError.message, { status: 500 });
  }

  const cohortRow = cohortRows?.[0];
  if (!cohortRow) {
    return new NextResponse('Cohort not found', { status: 404 });
  }

  type StudentRow = {
    id: string;
    name: string;
    department: string | null;
    job_title: string | null;
    organizations: { name: string } | null;
  };

  const { data: studentRowsRaw, error: studentError } = await supabase
    .from('students')
    .select('id, name, department, job_title, organizations(name)')
    .eq('cohort_id', cohortId)
    .order('name', { ascending: true })
    .returns<StudentRow[]>();
  if (studentError) {
    return new NextResponse(studentError.message, { status: 500 });
  }
  const studentRows = studentRowsRaw ?? [];

  const { data: sessionRowsRaw, error: sessionError } = await supabase
    .from('sessions')
    .select('id, session_date, title')
    .eq('cohort_id', cohortId)
    .order('session_date', { ascending: true });
  if (sessionError) {
    return new NextResponse(sessionError.message, { status: 500 });
  }
  const sessionRows = sessionRowsRaw ?? [];

  let recordRows: {
    session_id: string;
    student_id: string;
    status: string;
    note: string | null;
    credited_hours: string | null;
  }[] = [];
  if (sessionRows.length > 0) {
    const { data, error: recordError } = await supabase
      .from('attendance_records')
      .select('session_id, student_id, status, note, credited_hours')
      .in(
        'session_id',
        sessionRows.map((s) => s.id)
      );
    if (recordError) {
      return new NextResponse(recordError.message, { status: 500 });
    }
    recordRows = data ?? [];
  }

  const buf = await buildAttendanceWorkbook({
    cohortName: cohortRow.name,
    students: studentRows.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.department,
      organizationName: s.organizations?.name ?? null,
      department: null,
      jobTitle: s.job_title
    })),
    sessions: sessionRows.map((s) => ({
      id: s.id,
      sessionDate: s.session_date,
      title: s.title
    })),
    records: recordRows.map((r) => ({
      sessionId: r.session_id,
      studentId: r.student_id,
      status: r.status,
      note: r.note,
      creditedHours: r.credited_hours
    }))
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${cohortRow.name} 출석현황 ${today}.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store'
    }
  });
}
