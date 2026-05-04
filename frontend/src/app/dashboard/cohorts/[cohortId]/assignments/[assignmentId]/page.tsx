import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();

  const [{ data: assignment }, { data: students }, { data: submissions }] = await Promise.all([
    supabase
      .from('assignments')
      .select('id, title, description, due_date, cohorts(name)')
      .eq('id', assignmentId)
      .eq('cohort_id', cohortId)
      .single(),
    supabase
      .from('students')
      .select('id, name, organizations(name)')
      .eq('cohort_id', cohortId)
      .order('name'),
    supabase
      .from('assignment_submissions')
      .select('student_id, status, submitted_at, score, note, file_path, file_name, file_size, file_type')
      .eq('assignment_id', assignmentId)
  ]);

  if (!assignment) notFound();

  const recordMap = Object.fromEntries(
    (submissions ?? []).map((r) => [
      r.student_id,
      {
        status: r.status,
        submitted_at: r.submitted_at,
        score: r.score,
        note: r.note,
        file_path: r.file_path,
        file_name: r.file_name,
        file_size: r.file_size,
        file_type: r.file_type
      } satisfies SubmissionRecord
    ])
  );

  const cohortName = assignment.cohorts?.[0]?.name;
  const description = [
    cohortName,
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
        students={students ?? []}
        recordMap={recordMap}
      />
    </PageContainer>
  );
}
