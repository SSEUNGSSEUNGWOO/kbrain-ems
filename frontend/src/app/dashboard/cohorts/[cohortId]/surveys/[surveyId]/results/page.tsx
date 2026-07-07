import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResultsView } from './_components/results-view';
import { ShareResultsButton } from './_components/share-button';
import { PrintPdfButton } from './_components/print-button';

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
    <>
      {/* 인쇄 전용 CSS — 사이드바·헤더·버튼 숨기고 print-area만 A4로 인쇄. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          html, body { background: white !important; }
          body * { visibility: hidden; }
          #survey-print-area, #survey-print-area * { visibility: visible; }
          #survey-print-area {
            position: absolute; inset: 0; width: 100%;
            padding: 0; margin: 0; background: white;
          }
          #survey-print-area * {
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          /* 차트·표는 페이지 중간에서 잘리지 않게 */
          #survey-print-area .print-avoid-break,
          #survey-print-area svg,
          #survey-print-area table { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <PageContainer
        pageTitle='설문 결과'
        pageDescription={`${cohort.name} · ${survey.title}`}
        pageHeaderAction={
          <div className='flex gap-2 no-print'>
            <PrintPdfButton />
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
        <div id='survey-print-area'>
          <ResultsView cohortId={cohortId} surveyId={surveyId} showReportHeader />
        </div>
      </PageContainer>
    </>
  );
}
