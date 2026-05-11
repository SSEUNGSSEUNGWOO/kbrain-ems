import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ApplicationForm } from './_components/application-form';

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ApplyPage({ params }: Props) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: cohort } = await supabase
    .from('cohorts')
    .select('id, name, application_start_at, application_end_at')
    .eq('recruiting_slug', slug)
    .maybeSingle();

  if (!cohort) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const beforeStart = cohort.application_start_at && today < cohort.application_start_at;
  const afterEnd = cohort.application_end_at && today > cohort.application_end_at;

  if (beforeStart || afterEnd) {
    const message = beforeStart
      ? `모집 시작 전입니다 — ${cohort.application_start_at}부터 신청 가능`
      : `모집이 마감되었습니다 — ${cohort.application_end_at}까지`;
    return (
      <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
        <div className='w-full max-w-sm rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
          <div className='mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400'>
            {cohort.name}
          </div>
          <h2 className='text-base font-bold text-slate-900'>{beforeStart ? '모집 예정' : '모집 마감'}</h2>
          <p className='mt-2 text-sm text-slate-500'>{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-8 sm:py-12'>
      <div className='mx-auto max-w-2xl'>
        <ApplicationForm
          slug={slug}
          cohortName={cohort.name}
          applicationEndAt={cohort.application_end_at}
        />
      </div>
    </main>
  );
}
