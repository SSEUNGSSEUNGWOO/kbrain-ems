import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { ShareEntryForm } from './_components/share-entry-form';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ code: string }> };

export default async function ExamShareEntryPage({ params }: Props) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, description, cohort_id, cohorts(name)')
    .eq('share_code', code)
    .maybeSingle<{
      id: string;
      name: string;
      description: string | null;
      cohort_id: string | null;
      cohorts: { name: string } | null;
    }>();
  if (!exam) notFound();

  const { count: totalQ } = await supabase
    .from('exam_questions_in_exam')
    .select('question_id', { count: 'exact', head: true })
    .eq('exam_id', exam.id);

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col'>
      <header className='border-b border-slate-200 bg-white/60 backdrop-blur'>
        <div className='mx-auto max-w-md px-6 py-4 flex items-center justify-between'>
          <div className='flex items-center gap-2.5'>
            <div className='h-8 w-8 rounded-md bg-slate-900 text-white flex items-center justify-center text-[11px] font-bold tracking-tighter'>
              KB
            </div>
            <div className='text-sm font-semibold tracking-tight'>K-Brain EMS</div>
          </div>
          <div className='text-[10px] font-mono uppercase tracking-widest text-slate-400'>
            응시자 확인
          </div>
        </div>
      </header>

      <main className='flex-1 mx-auto max-w-md w-full px-6 py-12 flex flex-col justify-center'>
        <div className='mb-8 text-center'>
          <div className='inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-[11px] font-semibold tracking-wide mb-4'>
            응시 안내
          </div>
          <h1 className='text-2xl font-bold tracking-tight text-slate-900 mb-2'>{exam.name}</h1>
          {exam.cohorts && (
            <p className='text-xs text-slate-500'>대상: {exam.cohorts.name}</p>
          )}
        </div>

        <div className='rounded-2xl border border-slate-200 bg-white shadow-sm p-6 mb-4'>
          <div className='grid grid-cols-2 divide-x divide-slate-200 text-center'>
            <div className='px-4'>
              <div className='text-[10px] uppercase tracking-widest text-slate-400 mb-1.5'>문항</div>
              <div className='text-base font-semibold'>{totalQ ?? 0}문항</div>
            </div>
            <div className='px-4'>
              <div className='text-[10px] uppercase tracking-widest text-slate-400 mb-1.5'>방식</div>
              <div className='text-base font-semibold'>순차 CBT</div>
            </div>
          </div>
        </div>

        <ShareEntryForm code={code} />

        <p className='mt-4 text-center text-[11px] text-slate-400 leading-relaxed'>
          본인 확인용입니다. 명단에 등록된 이름과 등록 전화번호 뒷 4자리를 입력하세요.
        </p>
      </main>
    </div>
  );
}
