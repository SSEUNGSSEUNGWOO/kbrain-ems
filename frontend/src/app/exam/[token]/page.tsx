import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { StartButton } from './_components/start-button';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export default async function ExamIntroPage({ params }: Props) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from('exam_sessions')
    .select('id, exam_id, name, started_at, submitted_at, exams(name, description, time_limit_minutes, fullscreen_required)')
    .eq('token', token)
    .maybeSingle<{
      id: string;
      exam_id: string;
      name: string | null;
      started_at: string | null;
      submitted_at: string | null;
      exams: {
        name: string;
        description: string | null;
        time_limit_minutes: number | null;
        fullscreen_required: boolean;
      } | null;
    }>();

  if (!session || !session.exams) notFound();

  if (session.submitted_at) redirect(`/exam/${token}/done`);
  if (session.started_at) redirect(`/exam/${token}/take`);

  const { count: totalQ } = await supabase
    .from('exam_questions_in_exam')
    .select('question_id', { count: 'exact', head: true })
    .eq('exam_id', session.exam_id);

  const exam = session.exams;

  return (
    <div className='min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6'>
      <div className='max-w-xl w-full space-y-6'>
        <div className='space-y-2'>
          <div className='text-xs uppercase tracking-widest text-slate-400'>실전평가 · CBT</div>
          <h1 className='text-2xl font-semibold'>{exam.name}</h1>
          {exam.description && (
            <p className='text-sm text-slate-500 leading-relaxed'>{exam.description}</p>
          )}
        </div>

        <div className='rounded-lg border border-slate-200 bg-white p-5 space-y-3 text-sm shadow-sm'>
          <Row label='응시자' value={session.name ?? '(미지정)'} />
          <Row label='총 문항' value={`${totalQ ?? 0}문항`} />
          <Row
            label='총 시간'
            value={exam.time_limit_minutes ? `${exam.time_limit_minutes}분` : '문항별 제한'}
          />
        </div>

        <div className='rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 space-y-1'>
          <p className='font-semibold'>안내</p>
          <ul className='list-disc pl-4 space-y-0.5'>
            <li>시작 후에는 이전 문항으로 돌아갈 수 없습니다.</li>
            <li>문항별 시간 제한이 있으면 시간 초과 시 자동으로 다음 문항으로 이동합니다.</li>
            {exam.fullscreen_required && (
              <li>시험은 전체화면 모드에서만 응시할 수 있으며, 화면 이탈 시 기록됩니다.</li>
            )}
            <li>브라우저 새로고침·닫기 시에도 시험 시간은 계속 흐릅니다.</li>
          </ul>
        </div>

        <StartButton token={token} fullscreenRequired={exam.fullscreen_required} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex justify-between items-center'>
      <span className='text-slate-500'>{label}</span>
      <span className='text-slate-900 font-medium'>{value}</span>
    </div>
  );
}
