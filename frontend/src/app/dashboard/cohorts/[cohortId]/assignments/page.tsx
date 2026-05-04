import PageContainer from '@/components/layout/page-container';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { AssignmentList } from './_components/assignment-list';
import { CreateAssignmentSheet } from './_components/create-assignment-sheet';

export default async function AssignmentsPage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const supabase = await createClient();

  const [
    { data: cohort },
    { data: assignments, error: assignmentsError },
    { count: studentCount }
  ] = await Promise.all([
    supabase
      .from('cohorts')
      .select('id, name')
      .eq('id', cohortId)
      .single(),
    supabase
      .from('assignments')
      .select('id, title, description, due_date, assignment_submissions(status)')
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false }),
    supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('cohort_id', cohortId)
  ]);

  if (!cohort) notFound();

  if (assignmentsError) {
    return (
      <PageContainer pageTitle='과제' pageDescription={`${cohort.name} 과제 관리`}>
        <div className='text-destructive'>
          과제 목록을 불러오지 못했습니다: {assignmentsError.message}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle='과제'
      pageDescription={`${cohort.name} 과제 출제, 제출 관리 및 채점`}
      pageHeaderAction={<CreateAssignmentSheet cohortId={cohortId} />}
    >
      <AssignmentList
        cohortId={cohortId}
        assignments={assignments ?? []}
        studentCount={studentCount ?? 0}
      />
    </PageContainer>
  );
}
