'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startSurvey } from '../_actions';

type Props = {
  code: string;
  surveyTitle: string;
  cohortName: string;
};

export function IdentifyForm({ code, surveyTitle, cohortName }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleStart = () => {
    setError(null);
    startTransition(async () => {
      const result = await startSurvey(code);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push(`/survey/${result.token}`);
    });
  };

  return (
    <div className='w-full'>
      <div className='mx-auto mb-6 h-1 w-16 rounded-full bg-gradient-to-r from-blue-500 to-violet-500' />

      <div className='rounded-2xl border bg-white px-8 py-10 shadow-lg'>
        <div className='mb-8 text-center'>
          <div className='mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400'>
            {cohortName}
          </div>
          <h1 className='text-lg font-bold text-slate-900'>{surveyTitle}</h1>
        </div>

        <div className='mb-6 rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900'>
          <div className='mb-1 font-semibold'>익명 응답입니다</div>
          <p className='text-xs leading-relaxed text-blue-800/80'>
            응답 내용은 누가 작성했는지 식별되지 않도록 익명으로 처리됩니다. 솔직한 의견 부탁드립니다.
          </p>
        </div>

        {error && (
          <div className='mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-600'>
            {error}
          </div>
        )}

        <button
          type='button'
          onClick={handleStart}
          disabled={pending}
          className='w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white transition-all hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {pending ? '시작하는 중...' : '설문 시작'}
        </button>
      </div>
    </div>
  );
}
