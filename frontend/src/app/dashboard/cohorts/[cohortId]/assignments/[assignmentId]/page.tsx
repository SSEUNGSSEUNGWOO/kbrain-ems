import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { AssignmentSubmissionTable } from './_components/assignment-submission-table';

type SubmissionRecord = {
  status: string;
  submitted_at: string | null;
  score: number | null;
  note: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
};

export default async function AssignmentDetailPage({
  params
}: {
  params: Promise<{ cohortId: string; assignmentId: string }>;
}) {
  const { cohortId, assignmentId } = await params;
  const supabase = createAdminClient();

  type AssignmentRow = {
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    cohorts: { name: string } | null;
  };
  type StudentRow = {
    id: string;
    name: string;
    organizations: { name: string } | null;
  };

  const [assignmentRes, studentRes, submissionRes] = await Promise.all([
    supabase
      .from('assignments')
      .select('id, title, description, due_date, cohorts(name)')
      .eq('id', assignmentId)
      .eq('cohort_id', cohortId)
      .limit(1)
      .returns<AssignmentRow[]>(),
    supabase
      .from('students')
      .select('id, name, organizations(name)')
      .eq('cohort_id', cohortId)
      .order('name', { ascending: true })
      .returns<StudentRow[]>(),
    supabase
      .from('assignment_submissions')
      .select(
        'student_id, status, submitted_at, score, note, file_path, file_name, file_size, file_type'
      )
      .eq('assignment_id', assignmentId)
  ]);

  if (assignmentRes.error) throw new Error(assignmentRes.error.message);
  if (studentRes.error) throw new Error(studentRes.error.message);
  if (submissionRes.error) throw new Error(submissionRes.error.message);

  const assignment = assignmentRes.data?.[0];
  if (!assignment) notFound();

  const studentRows = studentRes.data ?? [];
  const submissionRows = submissionRes.data ?? [];

  // Map students to expected shape
  const mappedStudents = studentRows.map((s) => ({
    id: s.id,
    name: s.name,
    organizations: s.organizations ? { name: s.organizations.name } : null
  }));

  const recordMap = Object.fromEntries(
    submissionRows.map((r) => [
      r.student_id,
      {
        status: r.status,
        submitted_at: r.submitted_at,
        score: r.score ? Number(r.score) : null,
        note: r.note,
        file_path: r.file_path,
        file_name: r.file_name,
        file_size: r.file_size,
        file_type: r.file_type
      } satisfies SubmissionRecord
    ])
  );

  const description = [
    assignment.cohorts?.name,
    assignment.due_date ? `제출 기한 ${assignment.due_date}` : null,
    assignment.description
  ].filter(Boolean).join(' · ');

  return (
    <PageContainer
      pageTitle={assignment.title}
      pageDescription={description || '과제 제출 현황'}
    >
      <AssignmentSubmissionTable
        assignmentId={assignmentId}
        cohortId={cohortId}
        students={mappedStudents}
        recordMap={recordMap}
      />
    </PageContainer>
  );
}
