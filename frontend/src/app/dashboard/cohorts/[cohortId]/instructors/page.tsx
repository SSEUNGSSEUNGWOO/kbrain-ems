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

  // 1) 이 cohort의 sessions에 매핑된 instructor_id 추출
  const { data: siRows } = await supabase
    .from('session_instructors')
    .select('instructor_id, sessions!inner(cohort_id)')
    .eq('sessions.cohort_id', cohortId);

  const instructorIds = Array.from(
    new Set((siRows ?? []).map((r) => r.instructor_id))
  );

  // 2) instructors 마스터에서 해당 id만
  let rows: {
    id: string;
    name: string;
    affiliation: string | null;
    specialty: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  }[] = [];
  if (instructorIds.length > 0) {
    const { data } = await supabase
      .from('instructors')
      .select('id, name, affiliation, specialty, email, phone, notes')
      .in('id', instructorIds)
      .order('name');
    rows = data ?? [];
  }

  return (
    <PageContainer
      pageTitle='강사'
      pageDescription={
        rows.length > 0
          ? `이 기수에 매핑된 강사 ${rows.length}명`
          : '아직 이 기수에 매핑된 강사가 없습니다. 수업 생성 시 강사를 선택하면 여기에 자동으로 표시됩니다.'
      }
      pageHeaderAction={
        <InstructorSheet cohortId={cohortId} trigger={<Button>+ 새 강사</Button>} />
      }
    >
      <InstructorTable cohortId={cohortId} instructors={rows} />
    </PageContainer>
  );
}
