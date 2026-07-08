'use client';

import { useEffect } from 'react';

/**
 * 제출 완료 화면 액션 버튼.
 * - shareCode 있으면 공유 URL(응시자 로그인)로 이동 버튼
 * - F5(리로드) 감지 시 자동 리디렉트 (다음 응시자 편의)
 */
export function DoneActions({ shareCode }: { shareCode: string | null }) {
  const loginUrl = shareCode ? `/exam/share/${shareCode}` : null;

  useEffect(() => {
    if (!loginUrl) return;
    // F5·Ctrl+R로 done 페이지 재진입한 경우 자동 리디렉트
    // (첫 진입 = navigate, 재진입 = reload)
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (entries[0]?.type === 'reload') {
      window.location.replace(loginUrl);
    }
  }, [loginUrl]);

  return (
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
  );
}
