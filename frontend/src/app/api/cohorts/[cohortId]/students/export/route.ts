import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isViewer } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import {
  buildStudentsWorkbook,
  type ExportQuestion,
  type ExportStudentRow,
  type ExportAnswer
} from '@/lib/excel/students-export';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cohortId: string }> }
) {
  const { cohortId } = await params;
  const supabase = createAdminClient();
  const hidePersonal = await isViewer();

  const { data: cohort, error: cohortError } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('id', cohortId)
    .maybeSingle();
  if (cohortError) return new NextResponse(cohortError.message, { status: 500 });
  if (!cohort) return new NextResponse('Cohort not found', { status: 404 });

  type StudentRow = {
    applicant_id: string;
    name: string;
    department: string | null;
    job_title: string | null;
    job_role: string | null;
    email: string | null;
    phone: string | null;
    organizations: { name: string } | null;
    applicants: { category: string | null } | null;
  };

  const { data: studentRows, error: studentError } = await supabase
    .from('students')
    .select(
      'applicant_id, name, department, job_title, job_role, email, phone, organizations(name), applicants(category)'
    )
    .eq('cohort_id', cohortId)
    .order('name', { ascending: true })
    .returns<StudentRow[]>();
  if (studentError) return new NextResponse(studentError.message, { status: 500 });

  const applicantIds = (studentRows ?? []).map((s) => s.applicant_id).filter(Boolean);

  // 이 cohort 의 selected 신청 — applicant_id → application.id 매핑
  type AppRow = { id: string; applicant_id: string };
  const { data: appRows, error: appError } = await supabase
    .from('applications')
    .select('id, applicant_id')
    .eq('cohort_id', cohortId)
    .eq('status', 'selected')
    .in('applicant_id', applicantIds)
    .returns<AppRow[]>();
  if (appError) return new NextResponse(appError.message, { status: 500 });

  const appIdByApplicant = new Map<string, string>();
  for (const a of appRows ?? []) appIdByApplicant.set(a.applicant_id, a.id);

  // 이 cohort 의 application_questions 전체 (공통 + 트랙)
  const { data: questionsRaw, error: questionsError } = await supabase
    .from('application_questions')
    .select('id, question_no, question_text, question_type, choices, display_order')
    .eq('cohort_id', cohortId)
    .order('display_order', { ascending: true })
    .returns<ExportQuestion[]>();
  if (questionsError) return new NextResponse(questionsError.message, { status: 500 });
  const questions = questionsRaw ?? [];

  // application_answers
  const applicationIds = Array.from(appIdByApplicant.values());
  let answers: ExportAnswer[] = [];
  if (applicationIds.length > 0 && questions.length > 0) {
    const { data: ansRows, error: ansError } = await supabase
      .from('application_answers')
      .select('application_id, question_id, answer_value')
      .in('application_id', applicationIds)
      .returns<ExportAnswer[]>();
    if (ansError) return new NextResponse(ansError.message, { status: 500 });
    answers = ansRows ?? [];
  }

  // 현재 'selected' 신청자만 포함 — 취하(withdrawn)·탈락(rejected) 인원은 students 행이 남아 있어도 제외
  const selectedApplicantIds = new Set(appIdByApplicant.keys());
  const filteredStudentRows = (studentRows ?? []).filter((s) =>
    selectedApplicantIds.has(s.applicant_id)
  );

  const students: ExportStudentRow[] = filteredStudentRows.map((s) => ({
    applicantId: s.applicant_id,
    name: s.name,
    category: s.applicants?.category ?? null,
    organizationName: s.organizations?.name ?? null,
    department: s.department,
    jobTitle: s.job_title,
    jobRole: s.job_role,
    email: hidePersonal ? null : s.email,
    phone: hidePersonal ? null : s.phone,
    applicationId: appIdByApplicant.get(s.applicant_id) ?? null
  }));

  const buf = await buildStudentsWorkbook({
    cohortName: cohort.name,
    students,
    questions,
    answers,
    hidePersonal
  });

  await logActivity({
    actionType: 'download',
    resourceType: 'student',
    cohortId,
    summary: '인원 전체 엑셀 다운로드 (사전응답 포함)'
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${cohort.name} 인원명단 ${today}.xlsx`;
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
