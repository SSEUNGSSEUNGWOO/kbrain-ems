import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { NewSurveyForm } from './_components/new-survey-form';

type Props = {
  params: Promise<{ cohortId: string }>;
};

export default async function NewSurveyPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const [cohortRes, instructorsRes, surveysRes] = await Promise.all([
    supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle(),
    supabase.from('instructors').select('id, name, affiliation, specialty').order('name'),
    supabase
      .from('surveys')
      .select('id, title, share_code, created_at')
      .eq('cohort_id', cohortId)
      .eq('type', 'satisfaction')
      .order('created_at', { ascending: false })
  ]);

  if (!cohortRes.data) notFound();

  // 복제용 — 각 설문의 강사·세션 정보까지 미리 같이 prefetch (대신 클라이언트가 한 번 더 요청해도 OK).
  // 가벼운 list만 폼에 전달.
  const cloneSources = (surveysRes.data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    share_code: s.share_code
  }));

  return (
    <PageContainer
      pageTitle='새 만족도 설문'
      pageDescription={`${cohortRes.data.name} — 공통 12문항 + 강사별 6문항 + 서술형 3문항 자동 생성`}
    >
      <NewSurveyForm
        cohortId={cohortId}
        cohortName={cohortRes.data.name}
        instructors={instructorsRes.data ?? []}
        cloneSources={cloneSources}
      />
    </PageContainer>
  );
}
