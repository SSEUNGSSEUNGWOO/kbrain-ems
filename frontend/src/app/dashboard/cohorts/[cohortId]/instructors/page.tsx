import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import { InstructorSheet } from './_components/instructor-sheet';
import { InstructorTable } from './_components/instructor-table';

type Props = {
  params: Promise<{ cohortId: string }>;
};

export default async function InstructorsPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const { data: instructors } = await supabase
    .from('instructors')
    .select('id, name, affiliation, specialty, email, phone, notes')
    .order('name');

  const rows = instructors ?? [];

  return (
    <PageContainer
      pageTitle='강사·강사료'
      pageDescription={`등록 강사 ${rows.length}명 (모든 cohort 공통)`}
      pageHeaderAction={
        <InstructorSheet cohortId={cohortId} trigger={<Button>+ 새 강사</Button>} />
      }
    >
      <InstructorTable cohortId={cohortId} instructors={rows} />
    </PageContainer>
  );
}
