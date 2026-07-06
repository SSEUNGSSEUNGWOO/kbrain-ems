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
    <div className='min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6'>
      <div className='max-w-md w-full space-y-6 text-center'>
        <div className='mx-auto w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-2xl text-emerald-400'>
          ✓
        </div>
        <div className='space-y-2'>
          <div className='text-xs uppercase tracking-widest text-neutral-500'>제출 완료</div>
          <h1 className='text-xl font-semibold'>{session.exams.name}</h1>
          <p className='text-sm text-neutral-400'>
            {session.name ?? ''} 님, 시험이 정상 접수되었습니다.
          </p>
        </div>
        <div className='rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400'>
          제출 시각: {session.submitted_at ? new Date(session.submitted_at).toLocaleString('ko-KR') : '-'}
        </div>
        <p className='text-xs text-neutral-500'>이 창은 이제 닫으셔도 됩니다.</p>
      </div>
    </div>
  );
}
