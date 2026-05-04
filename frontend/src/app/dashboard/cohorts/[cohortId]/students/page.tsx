import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { StudentSheet } from './_components/student-sheet';
import { StudentTable } from './_components/student-table';

export default async function StudentsPage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name')
    .eq('id', cohortId)
    .single();

  if (!cohort) notFound();

  const { data: students, error } = await supabase
    .from('students')
    .select('id, name, organizations(name), department, job_title, job_role, birth_date, email, phone, notes')
    .eq('cohort_id', cohortId)
    .order('name');

  if (error) {
    return (
      <PageContainer pageTitle='인원 관리'>
        <div className='text-destructive'>불러오기 실패: {error.message}</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle='인원 관리'
      pageDescription={`${cohort.name} · 총 ${(students ?? []).length}명`}
      pageHeaderAction={
        <StudentSheet
          cohortId={cohortId}
          trigger={<Button>+ 인원 추가</Button>}
        />
      }
    >
      <StudentTable cohortId={cohortId} students={students ?? []} />
    </PageContainer>
  );
}
