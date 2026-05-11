import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { IdentifyForm } from './_components/identify-form';

type Props = {
  params: Promise<{ code: string }>;
};

export default async function SurveyShareEntryPage({ params }: Props) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: survey } = await supabase
    .from('surveys')
    .select('id, title, cohort_id, closes_at, cohorts(name)')
    .eq('share_code', code)
    .maybeSingle();

  if (!survey) notFound();

  if (survey.closes_at && new Date(survey.closes_at) < new Date()) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
        <div className='w-full max-w-sm rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
          <h2 className='text-lg font-bold text-slate-900'>마감된 설문입니다</h2>
          <p className='mt-2 text-sm text-slate-500'>응답 기간이 종료되었습니다.</p>
        </div>
      </main>
    );
  }

  const cohort = survey.cohorts as unknown as { name: string } | null;
  const cohortName = cohort?.name ?? '';

  return (
    <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-12'>
      <div className='w-full max-w-sm'>
        <IdentifyForm code={code} surveyTitle={survey.title} cohortName={cohortName} />
      </div>
    </main>
  );
}
