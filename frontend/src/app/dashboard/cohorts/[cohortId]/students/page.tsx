import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { computeCohortStage, STAGE_LABEL } from '@/lib/cohort-stage';
import { Button } from '@/components/ui/button';
import { StudentSheet } from './_components/student-sheet';
import { StudentTable } from './_components/student-table';
import { ApplicantsTable } from './_components/applicants-table';

export default async function StudentsPage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const { data: cohortRows, error: cohortError } = await supabase
    .from('cohorts')
    .select(
      'id, name, started_at, ended_at, application_start_at, application_end_at'
    )
    .eq('id', cohortId)
    .limit(1);
  if (cohortError) {
    return (
      <PageContainer pageTitle='인원 관리'>
        <div className='text-destructive'>불러오기 실패: {cohortError.message}</div>
      </PageContainer>
    );
  }

  const cohort = cohortRows?.[0];
  if (!cohort) notFound();

  const stage = computeCohortStage(cohort);

  // === 모집 단계 — 신청자 목록 + 합격 처리 ===
  if (stage === 'recruiting') {
    type ApplicationRow = {
      id: string;
      applicant_id: string;
      status: string;
      applied_at: string | null;
      motivation: string | null;
      applicants: {
        name: string;
        email: string | null;
        phone: string | null;
        organizations: { name: string } | null;
      } | null;
    };

    const { data: appRows, error: appErr } = await supabase
      .from('applications')
      .select(
        'id, applicant_id, status, applied_at, motivation, applicants(name, email, phone, organizations(name))'
      )
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false })
      .returns<ApplicationRow[]>();
    if (appErr) {
      return (
        <PageContainer pageTitle='인원 관리'>
          <div className='text-destructive'>불러오기 실패: {appErr.message}</div>
        </PageContainer>
      );
    }

    const rows = (appRows ?? []).map((r) => ({
      applicationId: r.id,
      applicantId: r.applicant_id,
      name: r.applicants?.name ?? '',
      organizationName: r.applicants?.organizations?.name ?? null,
      email: r.applicants?.email ?? null,
      phone: r.applicants?.phone ?? null,
      appliedAt: r.applied_at,
      status: r.status,
      motivation: r.motivation
    }));

    return (
      <PageContainer
        pageTitle='인원 관리'
        pageDescription={`${cohort.name} · ${STAGE_LABEL[stage]} · 신청 ${rows.length}건`}
      >
        <ApplicantsTable cohortId={cohortId} rows={rows} />
      </PageContainer>
    );
  }

  try {
    type StudentRow = {
      id: string;
      name: string;
      department: string | null;
      job_title: string | null;
      job_role: string | null;
      birth_date: string | null;
      email: string | null;
      phone: string | null;
      notes: string | null;
      organizations: { name: string } | null;
    };

    const { data: studentRows, error: studentError } = await supabase
      .from('students')
      .select(
        'id, name, department, job_title, job_role, birth_date, email, phone, notes, organizations(name)'
      )
      .eq('cohort_id', cohortId)
      .order('name', { ascending: true })
      .returns<StudentRow[]>();
    if (studentError) throw new Error(studentError.message);

    // Total sessions count for this cohort
    const { count: totalSessions, error: sessionCountError } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId);
    if (sessionCountError) throw new Error(sessionCountError.message);

    // Per-student attended session count (status !== 'absent')
    // Drizzle의 inner join + group by 대체: cohort 세션 id를 먼저 가져와서 in 필터
    const { data: cohortSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('cohort_id', cohortId);
    const cohortSessionIds = (cohortSessions ?? []).map((s) => s.id);

    let attendanceRows: { student_id: string; status: string }[] = [];
    if (cohortSessionIds.length > 0) {
      const { data: attData, error: attError } = await supabase
        .from('attendance_records')
        .select('student_id, status')
        .in('session_id', cohortSessionIds)
        .neq('status', 'absent');
      if (attError) throw new Error(attError.message);
      attendanceRows = attData ?? [];
    }

    const attendanceMap = new Map<string, number>();
    for (const r of attendanceRows) {
      attendanceMap.set(r.student_id, (attendanceMap.get(r.student_id) ?? 0) + 1);
    }

    const mapped = (studentRows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      organizations: r.organizations ? { name: r.organizations.name } : null,
      department: r.department,
      job_title: r.job_title,
      job_role: r.job_role,
      birth_date: r.birth_date,
      email: r.email,
      phone: r.phone,
      notes: r.notes,
      attendedSessions: attendanceMap.get(r.id) ?? 0,
      totalSessions: totalSessions ?? 0
    }));

    return (
      <PageContainer
        pageTitle='인원 관리'
        pageDescription={`${cohort.name} · 총 ${mapped.length}명`}
        pageHeaderAction={
          <StudentSheet
            cohortId={cohortId}
            trigger={<Button>+ 인원 추가</Button>}
          />
        }
      >
        <StudentTable cohortId={cohortId} students={mapped} />
      </PageContainer>
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    return (
      <PageContainer pageTitle='인원 관리'>
        <div className='text-destructive'>불러오기 실패: {message}</div>
      </PageContainer>
    );
  }
}
