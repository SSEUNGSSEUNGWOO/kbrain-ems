import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { AssignmentList } from './_components/assignment-list';
import { CreateAssignmentSheet } from './_components/create-assignment-sheet';

export default async function AssignmentsPage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const [cohortRes, assignmentRes, studentCountRes, sessionListRes] = await Promise.all([
    supabase
      .from('cohorts')
      .select('id, name')
      .eq('id', cohortId)
      .limit(1),
    supabase
      .from('assignments')
      .select('id, title, description, due_date, created_at, sessions(session_date)')
      .eq('cohort_id', cohortId),
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId),
    supabase
      .from('sessions')
      .select('id, title, session_date')
      .eq('cohort_id', cohortId)
      .order('session_date', { ascending: true })
  ]);

  if (cohortRes.error) throw new Error(cohortRes.error.message);
  if (assignmentRes.error) throw new Error(assignmentRes.error.message);
  if (studentCountRes.error) throw new Error(studentCountRes.error.message);

  const cohort = cohortRes.data?.[0];
  if (!cohort) notFound();

  // 회차 순서(session_date asc, null 마지막)로 정렬
  type RawRow = {
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    created_at: string;
    sessions: { session_date: string } | { session_date: string }[] | null;
  };
  const getSessionDate = (a: RawRow): string | null => {
    if (!a.sessions) return null;
    if (Array.isArray(a.sessions)) return a.sessions[0]?.session_date ?? null;
    return a.sessions.session_date ?? null;
  };
  const assignmentRows = ((assignmentRes.data ?? []) as RawRow[]).slice().toSorted((a, b) => {
    const aDate = getSessionDate(a);
    const bDate = getSessionDate(b);
    if (!aDate && !bDate) return a.created_at.localeCompare(b.created_at);
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate.localeCompare(bDate);
  });
  const studentCount = studentCountRes.count ?? 0;

  // Fetch submissions for all assignments
  const assignmentIds = assignmentRows.map((a) => a.id);
  let submissionRows: { assignment_id: string; status: string }[] = [];
  if (assignmentIds.length > 0) {
    const { data, error } = await supabase
      .from('assignment_submissions')
      .select('assignment_id, status')
      .in('assignment_id', assignmentIds);
    if (error) throw new Error(error.message);
    submissionRows = data ?? [];
  }

  // Group submissions by assignment
  const submissionsByAssignment = new Map<string, { status: string }[]>();
  for (const s of submissionRows) {
    if (!submissionsByAssignment.has(s.assignment_id)) {
      submissionsByAssignment.set(s.assignment_id, []);
    }
    submissionsByAssignment.get(s.assignment_id)!.push({ status: s.status });
  }

  const mappedAssignments = assignmentRows.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    due_date: a.due_date,
    assignment_submissions: submissionsByAssignment.get(a.id) ?? []
  }));

  return (
    <PageContainer
      pageTitle='과제'
      pageDescription={`${cohort.name} 과제 출제, 제출 관리 및 채점`}
      pageHeaderAction={<CreateAssignmentSheet cohortId={cohortId} sessions={sessionListRes.data ?? []} />}
    >
      <AssignmentList
        cohortId={cohortId}
        assignments={mappedAssignments}
        studentCount={studentCount}
      />
    </PageContainer>
  );
}
