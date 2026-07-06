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
    <div className='space-y-2'>
      <button
        type='button'
        onClick={onClick}
        disabled={pending}
        className='w-full rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 font-semibold py-3 transition-colors'
      >
        {pending ? '시작 중...' : '시험 시작하기'}
      </button>
      {error && <p className='text-xs text-rose-400'>{error}</p>}
    </div>
  );
}
