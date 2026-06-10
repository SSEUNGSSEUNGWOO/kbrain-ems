import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ResultsView } from '@/app/dashboard/cohorts/[cohortId]/surveys/[surveyId]/results/_components/results-view';

type Props = { params: Promise<{ code: string }> };

export const dynamic = 'force-dynamic';

export default async function PublicSurveyResultsPage({ params }: Props) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: survey } = await supabase
    .from('surveys')
    .select('id, cohort_id, results_share_code')
    .eq('results_share_code', code)
    .maybeSingle();

  if (!survey || survey.results_share_code !== code) notFound();

  return (
    <ResultsView cohortId={survey.cohort_id} surveyId={survey.id} showReportHeader />
  );
}
