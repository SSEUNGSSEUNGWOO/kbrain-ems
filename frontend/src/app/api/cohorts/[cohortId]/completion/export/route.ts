import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { computeAttendanceCounts } from '@/lib/completion';
import { isTestStudent } from '@/lib/students';
import { buildCompletionWorkbook } from '@/lib/excel/completion-export';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const { cohortId } = await params;
  const url = new URL(req.url);
  const minParam = Number(url.searchParams.get('min') ?? '');
  const minAttendance = Number.isFinite(minParam) && minParam > 0 ? Math.floor(minParam) : 3;

  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const { data: cohortRow, error: cohortError } = await supabase
    .from('cohorts')
    .select('id, name, category')
    .eq('id', cohortId)
    .maybeSingle();
  if (cohortError) return new NextResponse(cohortError.message, { status: 500 });
  if (!cohortRow) return new NextResponse('Cohort not found', { status: 404 });
  if (cohortRow.category !== 'general') {
    return new NextResponse(
      '일반교육 과정에서만 수료자 명단 자동 생성을 지원합니다.',
      { status: 400 }
    );
  }

  type StudentRow = {
    id: string;
    name: string;
    phone: string | null;
    organizations: { name: string } | null;
  };

  const studentCols = hidePersonal
    ? 'id, name, organizations(name)'
    : 'id, name, phone, organizations(name)';
  const { data: studentsRaw, error: studentError } = await supabase
    .from('students')
    .select(studentCols)
    .eq('cohort_id', cohortId)
    .order('name', { ascending: true })
    .returns<StudentRow[]>();
  if (studentError) return new NextResponse(studentError.message, { status: 500 });

  const students = (studentsRaw ?? []).filter((s) => !isTestStudent(s.name));
  const { totalSessions, perStudent } = await computeAttendanceCounts(
    supabase,
    cohortId,
    students.map((s) => s.id)
  );

  const rows = students
    .map((s) => {
      const counts = perStudent.get(s.id) ?? { attended: 0, absent: 0 };
      return {
        name: s.name,
        organizationName: s.organizations?.name ?? null,
        phone: hidePersonal ? null : (s.phone ?? null),
        completed: counts.attended >= minAttendance
      };
    })
    .filter((r) => r.completed);

  const buf = await buildCompletionWorkbook({
    cohortName: cohortRow.name,
    totalSessions,
    minAttendance,
    rows,
    hidePersonal
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${cohortRow.name} 수료자명단 ${today}.xlsx`;
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
