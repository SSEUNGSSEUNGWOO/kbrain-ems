import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { NewLessonForm } from './_components/new-lesson-form';

type Props = {
  params: Promise<{ cohortId: string }>;
};

export default async function NewLessonPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const [cohortRes, instructorsRes, locationsRes] = await Promise.all([
    supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle(),
    supabase.from('instructors').select('id, name, affiliation').eq('kind', 'main').order('name'),
    supabase.from('locations').select('id, name').order('name')
  ]);

  if (!cohortRes.data) notFound();

  return (
    <PageContainer
      pageTitle='새 수업'
      pageDescription={`${cohortRes.data.name} — 회차 추가 (출결 자동 + 과제·만족도 선택)`}
    >
      <NewLessonForm
        cohortId={cohortId}
        cohortName={cohortRes.data.name}
        instructors={instructorsRes.data ?? []}
        locations={locationsRes.data ?? []}
      />
    </PageContainer>
  );
}
