import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import { InstructorSheet } from './_components/instructor-sheet';
import { InstructorTable } from './_components/instructor-table';

export default async function InstructorPoolPage() {
  const supabase = createAdminClient();

  const { data: instructors } = await supabase
    .from('instructors')
    .select('id, name, affiliation, specialty, email, phone, notes')
    .order('name');

  const rows = instructors ?? [];

  return (
    <PageContainer
      pageTitle='강사풀'
      pageDescription={`등록된 모든 강사 ${rows.length}명. 기수 무관 공통 마스터.`}
      pageHeaderAction={
        <InstructorSheet trigger={<Button>+ 새 강사</Button>} />
      }
    >
      <InstructorTable instructors={rows} />
    </PageContainer>
  );
}
