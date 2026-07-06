import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export default async function ExamDonePage({ params }: Props) {
  const { token } = await params;
  const s = createAdminClient();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, name, submitted_at, exams(name)')
    .eq('token', token)
    .maybeSingle<{
      id: string;
      name: string | null;
      submitted_at: string | null;
      exams: { name: string } | null;
    }>();

  if (!session || !session.exams) notFound();

  return (
    <div className='min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6'>
      <div className='max-w-md w-full space-y-6 text-center'>
        <div className='mx-auto w-14 h-14 rounded-full bg-emerald-100 border border-emerald-500 flex items-center justify-center text-2xl text-emerald-600'>
          ✓
        </div>
        <div className='space-y-2'>
          <div className='text-xs uppercase tracking-widest text-slate-400'>제출 완료</div>
          <h1 className='text-xl font-semibold'>{session.exams.name}</h1>
          <p className='text-sm text-slate-500'>
            {session.name ?? ''} 님, 시험이 정상 접수되었습니다.
          </p>
        </div>
        <div className='rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm'>
          제출 시각: {session.submitted_at ? new Date(session.submitted_at).toLocaleString('ko-KR') : '-'}
        </div>
        <p className='text-xs text-slate-400'>이 창은 이제 닫으셔도 됩니다.</p>
      </div>
    </div>
  );
}
