'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startSession } from '../_actions';

export function StartButton({
  token,
  fullscreenRequired
}: {
  token: string;
  fullscreenRequired: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    if (fullscreenRequired) {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        setError('전체화면 진입에 실패했습니다. 브라우저 권한을 확인해주세요.');
        return;
      }
    }
    startTransition(async () => {
      const res = await startSession(token);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(`/exam/${token}/take`);
    });
  };

  return (
    <>
      <div className='space-y-2'>
        <button
          type='button'
          onClick={onClick}
          disabled={pending}
          className='w-full rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 transition-colors shadow-sm'
        >
          {pending ? '시작 중...' : '시험 시작하기'}
        </button>
        {error && <p className='text-xs text-rose-600'>{error}</p>}
      </div>
      {/* 시작 중 전면 로딩 오버레이 (Vercel 콜드스타트·서버 렌더링 대기 몇 초) */}
      {pending && (
        <div className='fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm'>
          <div className='rounded-2xl bg-white px-8 py-6 shadow-2xl border-2 border-slate-200 flex items-center gap-4'>
            <div className='h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin' />
            <div>
              <div className='text-sm font-bold text-slate-900'>시험 시작 중…</div>
              <div className='text-xs text-slate-500 mt-0.5'>잠시만 기다려주세요</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
