import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { IdentifyForm } from './_components/identify-form';

type Props = {
  params: Promise<{ code: string }>;
};

export const dynamic = 'force-dynamic';

export default async function DiagnosisShareEntryPage({ params }: Props) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: diag } = await supabase
    .from('diagnoses')
    .select('id, title, type, opens_at, closes_at, cohorts(name)')
    .eq('share_code', code)
    .maybeSingle();

  if (!diag) notFound();

  const now = Date.now();
  const notYet = diag.opens_at && new Date(diag.opens_at).getTime() > now;
  const closed = diag.closes_at && new Date(diag.closes_at).getTime() < now;

  if (notYet) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
        <div className='w-full max-w-sm rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
          <h2 className='text-lg font-bold text-slate-900'>아직 응답할 수 없습니다</h2>
          <p className='mt-2 text-sm text-slate-500'>응답 가능 시각이 되지 않았습니다.</p>
        </div>
      </main>
    );
  }
  if (closed) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4'>
        <div className='w-full max-w-sm rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
          <h2 className='text-lg font-bold text-slate-900'>마감된 평가입니다</h2>
          <p className='mt-2 text-sm text-slate-500'>응답 기간이 종료되었습니다.</p>
        </div>
      </main>
    );
  }

  const cohortName =
    (diag.cohorts as unknown as { name: string } | null)?.name ?? '';

  return (
    <main className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-12'>
      <div className='w-full max-w-sm'>
        <IdentifyForm
          code={code}
          diagnosisTitle={diag.title}
          diagnosisType={diag.type}
          cohortName={cohortName}
        />
      </div>
    </main>
  );
}
