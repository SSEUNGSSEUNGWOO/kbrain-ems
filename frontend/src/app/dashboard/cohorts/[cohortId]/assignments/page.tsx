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

  const [cohortRes, assignmentRes, studentCountRes] = await Promise.all([
    supabase
      .from('cohorts')
      .select('id, name')
      .eq('id', cohortId)
      .limit(1),
    supabase
      .from('assignments')
      .select('id, title, description, due_date, created_at')
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false }),
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId)
  ]);

  if (cohortRes.error) throw new Error(cohortRes.error.message);
  if (assignmentRes.error) throw new Error(assignmentRes.error.message);
  if (studentCountRes.error) throw new Error(studentCountRes.error.message);

  const cohort = cohortRes.data?.[0];
  if (!cohort) notFound();

  const assignmentRows = assignmentRes.data ?? [];
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
      pageHeaderAction={<CreateAssignmentSheet cohortId={cohortId} />}
    >
      <AssignmentList
        cohortId={cohortId}
        assignments={mappedAssignments}
        studentCount={studentCount}
      />
    </PageContainer>
  );
}
