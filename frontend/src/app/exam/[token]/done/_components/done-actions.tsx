'use client';

import { useEffect, useState } from 'react';

const REDIRECT_SECONDS = 3;

/**
 * 제출 완료 화면 액션 버튼.
 * - shareCode 있으면 공유 URL(응시자 로그인)로 이동 버튼
 * - F5(리로드) 감지 시 3초 카운트다운 후 리디렉트 (취소 가능)
 */
export function DoneActions({ shareCode }: { shareCode: string | null }) {
  const loginUrl = shareCode ? `/exam/share/${shareCode}` : null;
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!loginUrl) return;
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (entries[0]?.type === 'reload') {
      setCountdown(REDIRECT_SECONDS);
    }
  }, [loginUrl]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      window.location.replace(loginUrl!);
      return;
    }
    const t = setTimeout(() => setCountdown((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, loginUrl]);

  const cancelRedirect = () => setCountdown(null);

  return (
    <>
      {countdown !== null && (
        <div className='mt-6 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3'>
          <div className='flex items-center gap-2 text-sm text-amber-900'>
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4 flex-shrink-0'>
              <circle cx='12' cy='12' r='10' /><polyline points='12 6 12 12 16 14' />
            </svg>
            <span>
              <b className='tabular-nums'>{countdown}초</b> 후 다음 응시자 로그인 화면으로 이동합니다
            </span>
          </div>
          <button
            type='button'
            onClick={cancelRedirect}
            className='rounded-md bg-white hover:bg-slate-50 border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-800'
          >
            취소
          </button>
        </div>
      )}
      <div className='mt-6 flex flex-col sm:flex-row gap-2'>
      {loginUrl && (
        <a
          href={loginUrl}
          className='flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-3 transition-colors shadow-sm'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='h-4 w-4'
          >
            <path d='M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' />
            <polyline points='10 17 15 12 10 7' />
            <line x1='15' x2='3' y1='12' y2='12' />
          </svg>
          다음 응시자 로그인
        </a>
      )}
      <a
        href='/'
        className='flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold px-4 py-3 transition-colors shadow-sm'
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
          className='h-4 w-4'
        >
          <path d='M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' />
          <polyline points='9 22 9 12 15 12 15 22' />
        </svg>
        홈으로
      </a>
      </div>
    </>
  );
}
