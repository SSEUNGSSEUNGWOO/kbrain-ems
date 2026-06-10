import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResultsView } from './_components/results-view';
import { ShareResultsButton } from './_components/share-button';

type Props = {
  params: Promise<{ cohortId: string; surveyId: string }>;
};

export default async function SurveyResultsPage({ params }: Props) {
  const { cohortId, surveyId } = await params;
  const supabase = createAdminClient();

  const [{ data: survey }, { data: cohort }] = await Promise.all([
    supabase
      .from('surveys')
      .select('id, title, cohort_id, results_share_code')
      .eq('id', surveyId)
      .maybeSingle(),
    supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle()
  ]);

  if (!survey || !cohort) notFound();
  if (survey.cohort_id !== cohortId) notFound();

  return (
    <PageContainer
      pageTitle='설문 결과'
      pageDescription={`${cohort.name} · ${survey.title}`}
      pageHeaderAction={
        <div className='flex gap-2'>
          <Link href={`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/preview`}>
            <Button variant='outline'>미리보기</Button>
          </Link>
          <Link href={`/dashboard/cohorts/${cohortId}/surveys`}>
            <Button variant='outline'>← 목록</Button>
          </Link>
          <ShareResultsButton
            cohortId={cohortId}
            surveyId={surveyId}
            initialCode={survey.results_share_code ?? null}
          />
        </div>
      }
    >
      <ResultsView cohortId={cohortId} surveyId={surveyId} />
    </PageContainer>
  );
}
