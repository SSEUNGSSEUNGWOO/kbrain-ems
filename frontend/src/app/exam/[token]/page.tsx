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
    .select(
      'id, exam_id, name, started_at, submitted_at, exams(name, description, time_limit_mc, time_limit_st, time_limit_task, fullscreen_required)'
    )
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
        time_limit_mc: number | null;
        time_limit_st: number | null;
        time_limit_task: number | null;
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
    <div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900 flex flex-col'>
      {/* 헤더 밴드 */}
      <header className='border-b border-slate-200 bg-white/60 backdrop-blur'>
        <div className='mx-auto max-w-3xl px-6 py-4 flex items-center justify-between'>
          <div className='flex items-center gap-2.5'>
            <div className='h-8 w-8 rounded-md bg-slate-900 text-white flex items-center justify-center text-[11px] font-bold tracking-tighter'>
              KB
            </div>
            <div className='text-sm font-semibold tracking-tight'>K-Brain EMS</div>
          </div>
          <div className='text-[10px] font-mono uppercase tracking-widest text-slate-400'>
            CBT · 실전평가
          </div>
        </div>
      </header>

      <main className='flex-1 mx-auto max-w-3xl w-full px-6 py-16 flex flex-col justify-center'>
        {/* 시험 타이틀 */}
        <div className='mb-10 text-center'>
          <div className='inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-[11px] font-semibold tracking-wide mb-4'>
            응시 대기
          </div>
          <h1 className='text-3xl font-bold tracking-tight text-slate-900 mb-2'>
            {exam.name}
          </h1>
          {exam.description && (
            <p className='text-sm text-slate-500 leading-relaxed max-w-lg mx-auto'>
              {exam.description}
            </p>
          )}
        </div>

        {/* 응시 정보 그리드 */}
        <div className='rounded-2xl border border-slate-200 bg-white shadow-sm p-6 mb-6'>
          <div className='grid grid-cols-3 divide-x divide-slate-200'>
            <InfoBlock label='응시자' value={session.name ?? '(미지정)'} />
            <InfoBlock label='총 문항' value={`${totalQ ?? 0}문항`} />
            <InfoBlock
              label='시험 시간'
              value={formatSectionTimes(exam.time_limit_mc, exam.time_limit_st, exam.time_limit_task)}
            />
          </div>
        </div>

        {/* 안내 */}
        <div className='rounded-2xl border border-slate-200 bg-white shadow-sm p-6 mb-8'>
          <h2 className='text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3'>
            응시 유의사항
          </h2>
          <ul className='space-y-2.5 text-sm text-slate-700'>
            <Note>
              시험은 <b>객관식 → 단답형 → 작업형</b> 3개 섹션 순으로 진행됩니다.
            </Note>
            <Note>
              각 섹션은 제한 시간이 지나면 자동으로 다음 섹션으로 넘어가며, <b>이전 섹션으로 되돌아갈 수 없습니다</b>.
            </Note>
            <Note>
              섹션 안에서는 문항 간 자유롭게 이동할 수 있고, 다시 볼 문항은 <b>검토 표시(깃발)</b>로 남겨둘 수 있습니다.
            </Note>
            <Note>답안은 입력·선택 즉시 자동 저장됩니다.</Note>
            {exam.fullscreen_required && (
              <Note>
                객관식·단답형은 <b>전체화면 모드</b>에서만 응시할 수 있으며, 화면 이탈·다른 창 전환 시 시간이 기록됩니다.
              </Note>
            )}
            <Note>새로고침·창 닫기 시에도 남은 시간은 계속 흐릅니다. 창을 닫지 마세요.</Note>
          </ul>
        </div>

        <StartButton token={token} fullscreenRequired={exam.fullscreen_required} />
        <p className='mt-3 text-center text-[11px] text-slate-400'>
          시작 버튼을 누르면 전체화면으로 전환되고 응시가 시작됩니다.
        </p>
      </main>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className='px-4 text-center'>
      <div className='text-[10px] uppercase tracking-widest text-slate-400 mb-1.5'>{label}</div>
      <div className='text-base font-semibold text-slate-900'>{value}</div>
    </div>
  );
}

function formatSectionTimes(mc: number | null, st: number | null, task: number | null): string {
  const toMin = (v: number | null) => (v ? Math.round(v / 60) : null);
  const m = toMin(mc);
  const s = toMin(st);
  const t = toMin(task);
  const parts: string[] = [];
  if (m) parts.push(`객관식 ${m}분`);
  if (s) parts.push(`단답 ${s}분`);
  if (t) parts.push(`작업형 ${t}분`);
  return parts.length > 0 ? parts.join(' · ') : '섹션별';
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <li className='flex items-start gap-2.5'>
      <svg
        className='mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
        strokeWidth='2.5'
      >
        <path strokeLinecap='round' strokeLinejoin='round' d='M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z' />
      </svg>
      <span className='leading-relaxed'>{children}</span>
    </li>
  );
}
