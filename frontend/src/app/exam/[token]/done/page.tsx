import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';
import { DoneActions } from './_components/done-actions';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

// Vercel Node.js는 UTC + ko 로케일 데이터 없음 → toLocaleString('ko-KR') 하면 UTC 시각이 "AM 3:55"로 잘못 표시.
// 로케일 무관하게 KST(UTC+9)로 직접 포맷.
function formatKst(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const mo = kst.getUTCMonth() + 1;
  const da = kst.getUTCDate();
  const h = kst.getUTCHours();
  const mi = kst.getUTCMinutes();
  const se = kst.getUTCSeconds();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}. ${mo}. ${da}. ${pad(h)}:${pad(mi)}:${pad(se)}`;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
function weekdayKst(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return WEEKDAY[kst.getUTCDay()];
}

export default async function ExamDonePage({ params }: Props) {
  const { token } = await params;
  const s = createAdminClient();

  const { data: session } = await s
    .from('exam_sessions')
    .select('id, name, submitted_at, exams(name, share_code)')
    .eq('token', token)
    .maybeSingle<{
      id: string;
      name: string | null;
      submitted_at: string | null;
      exams: { name: string; share_code: string | null } | null;
    }>();

  if (!session || !session.exams) notFound();

  const submittedAt = session.submitted_at;

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-900 flex items-center justify-center p-6'>
      <div className='w-full max-w-lg'>
        {/* 성공 인디케이터 */}
        <div className='relative mx-auto mb-8 flex h-24 w-24 items-center justify-center'>
          <div className='absolute inset-0 rounded-full bg-emerald-100 opacity-70 animate-pulse' />
          <div className='absolute inset-2 rounded-full bg-emerald-200 opacity-80' />
          <div className='relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/40'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='3'
              strokeLinecap='round'
              strokeLinejoin='round'
              className='h-9 w-9 text-white'
            >
              <polyline points='20 6 9 17 4 12' />
            </svg>
          </div>
        </div>

        {/* 헤드라인 */}
        <div className='text-center mb-8'>
          <div className='inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-700 mb-3'>
            <span className='inline-block h-1.5 w-1.5 rounded-full bg-emerald-500' />
            제출 완료
          </div>
          <h1 className='text-2xl font-bold text-slate-900 mb-2'>
            시험이 정상 접수되었습니다
          </h1>
          <p className='text-sm text-slate-500'>
            {session.name ? `${session.name} 님, ` : ''}수고 많으셨습니다.
          </p>
        </div>

        {/* 정보 카드 */}
        <div className='rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-sm shadow-slate-200/50 divide-y divide-slate-100'>
          <div className='flex items-center gap-4 px-5 py-4'>
            <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600'>
              <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5'>
                <path d='M14 3v4a1 1 0 0 0 1 1h4' />
                <path d='M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z' />
                <path d='M9 9h1M9 13h6M9 17h6' />
              </svg>
            </div>
            <div className='min-w-0 flex-1'>
              <div className='text-[10px] uppercase tracking-widest text-slate-400 mb-0.5'>시험명</div>
              <div className='text-sm font-semibold text-slate-900 truncate'>{session.exams.name}</div>
            </div>
          </div>

          <div className='flex items-center gap-4 px-5 py-4'>
            <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600'>
              <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5'>
                <circle cx='12' cy='12' r='10' />
                <polyline points='12 6 12 12 16 14' />
              </svg>
            </div>
            <div className='min-w-0 flex-1'>
              <div className='text-[10px] uppercase tracking-widest text-slate-400 mb-0.5'>제출 시각 (KST)</div>
              <div className='font-mono text-sm font-semibold text-slate-900 tabular-nums'>
                {submittedAt ? (
                  <>
                    {formatKst(submittedAt)}
                    <span className='ml-1.5 text-xs font-normal text-slate-400'>({weekdayKst(submittedAt)})</span>
                  </>
                ) : '-'}
              </div>
            </div>
          </div>
        </div>

        {/* 안내 */}
        <div className='mt-6 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3'>
          <div className='flex gap-3'>
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600'>
              <circle cx='12' cy='12' r='10' />
              <path d='M12 16v-4M12 8h.01' />
            </svg>
            <div className='text-xs text-blue-900 leading-relaxed'>
              채점 결과는 별도 안내에 따라 확인하실 수 있습니다.
              <br />
              이 창은 이제 닫으셔도 됩니다.
            </div>
          </div>
        </div>

        {/* 액션 버튼 (F5 재진입 시 자동 로그인 화면 이동) */}
        <DoneActions shareCode={session.exams.share_code} />

        {/* 푸터 */}
        <div className='mt-8 text-center'>
          <div className='inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400'>
            <div className='h-5 w-5 rounded-md bg-slate-900 text-white flex items-center justify-center text-[8px] font-bold'>KB</div>
            KBrain EMS · CBT
          </div>
        </div>
      </div>
    </div>
  );
}
