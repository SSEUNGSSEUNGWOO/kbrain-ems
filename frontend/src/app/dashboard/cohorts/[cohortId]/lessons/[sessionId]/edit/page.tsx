import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { EditLessonForm } from './_components/edit-lesson-form';

type Props = {
  params: Promise<{ cohortId: string; sessionId: string }>;
};

export default async function EditLessonPage({ params }: Props) {
  const { cohortId, sessionId } = await params;
  const supabase = createAdminClient();

  const [sessionRes, allInstructorsRes, locationsRes, hasSurveyRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, session_date, title, location_id, session_instructors(instructor_id)')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase.from('instructors').select('id, name, affiliation').eq('kind', 'main').order('name'),
    supabase.from('locations').select('id, name').order('name'),
    supabase
      .from('surveys')
      .select('id')
      .eq('session_id', sessionId)
      .limit(1)
  ]);

  if (!sessionRes.data) notFound();

  type SessionRow = {
    id: string;
    session_date: string;
    title: string | null;
    location_id: string | null;
    session_instructors: { instructor_id: string }[];
  };
  const session = sessionRes.data as unknown as SessionRow;
  const initialInstructorIds = session.session_instructors.map((si) => si.instructor_id);
  const hasSurvey = (hasSurveyRes.data?.length ?? 0) > 0;

  return (
    <PageContainer pageTitle='수업 수정' pageDescription={`${session.session_date} · ${session.title ?? ''}`}>
      <EditLessonForm
        cohortId={cohortId}
        sessionId={sessionId}
        initialDate={session.session_date}
        initialTitle={session.title ?? ''}
        initialLocationId={session.location_id}
        initialInstructorIds={initialInstructorIds}
        instructors={allInstructorsRes.data ?? []}
        locations={locationsRes.data ?? []}
        hasSurvey={hasSurvey}
      />
    </PageContainer>
  );
}
