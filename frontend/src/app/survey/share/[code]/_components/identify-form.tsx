'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { lookupStudent, type LookupResult } from '../_actions';

type Props = {
  code: string;
  surveyTitle: string;
  cohortName: string;
};

type Confirm = Extract<LookupResult, { ok: true }>;

export function IdentifyForm({ code, surveyTitle, cohortName }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const router = useRouter();

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;

    startTransition(async () => {
      const result = await lookupStudent({ code, name });
      if ('error' in result) {
        setError(result.error);
      } else {
        setConfirm(result);
      }
    });
  };

  const handleProceed = () => {
    if (!confirm) return;
    router.push(`/survey/${confirm.token}`);
  };

  const handleBack = () => {
    setConfirm(null);
    setError(null);
  };

  // ===== 확인 화면 =====
  if (confirm) {
    const { student } = confirm;
    return (
      <div className='w-full'>
        <div className='mx-auto mb-6 h-1 w-16 rounded-full bg-gradient-to-r from-blue-500 to-violet-500' />

        <div className='rounded-2xl border bg-white px-8 py-10 shadow-lg'>
          <div className='mb-6 text-center'>
            <div className='mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400'>
              본인 정보 확인
            </div>
            <h2 className='text-base font-semibold text-slate-900'>아래 정보가 맞으시면 진행해 주세요</h2>
          </div>

          <dl className='mb-6 space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 px-5 py-4 text-sm'>
            <div className='flex justify-between gap-4'>
              <dt className='font-medium text-slate-500'>이름</dt>
              <dd className='font-semibold text-slate-900'>{student.name}</dd>
            </div>
            {student.organizationName && (
              <div className='flex justify-between gap-4'>
                <dt className='font-medium text-slate-500'>소속 기관</dt>
                <dd className='text-right text-slate-800'>{student.organizationName}</dd>
              </div>
            )}
            {student.birthDate && (
              <div className='flex justify-between gap-4'>
                <dt className='font-medium text-slate-500'>생년월일</dt>
                <dd className='text-slate-800'>{student.birthDate}</dd>
              </div>
            )}
          </dl>

          <div className='flex gap-2'>
            <button
              type='button'
              onClick={handleBack}
              className='flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'
            >
              아니에요
            </button>
            <button
              type='button'
              onClick={handleProceed}
              className='flex-[2] rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:from-blue-700 hover:to-blue-800'
            >
              맞아요, 설문 시작
            </button>
          </div>
        </div>

        <p className='mt-4 text-center text-xs text-slate-400'>
          정보가 잘못되었으면 운영팀에 문의해 주세요
        </p>
      </div>
    );
  }

  // ===== 이름 입력 화면 =====
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

        <div className='mb-6 text-center'>
          <h2 className='text-base font-semibold text-slate-800'>설문 시작</h2>
          <p className='mt-1 text-sm text-slate-500'>본인 확인을 위해 이름을 입력해 주세요</p>
        </div>

        <form onSubmit={handleLookup} className='space-y-4'>
          <input
            type='text'
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder='홍길동'
            autoFocus
            className='w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-center text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
          />

          {error && (
            <div className='rounded-lg bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-600'>
              {error}
            </div>
          )}

          <button
            type='submit'
            disabled={pending || !name.trim()}
            className='w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white transition-all hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {pending ? '확인 중...' : '확인'}
          </button>
        </form>
      </div>

      <p className='mt-4 text-center text-xs text-slate-400'>
        등록된 교육생만 응답할 수 있습니다
      </p>
    </div>
  );
}
