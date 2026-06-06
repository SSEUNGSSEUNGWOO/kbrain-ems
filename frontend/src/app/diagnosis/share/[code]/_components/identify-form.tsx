'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { identifyAndStart } from '../_actions';

type Props = {
  code: string;
  diagnosisTitle: string;
  diagnosisType: string;
  cohortName: string;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'verifying' }
  | { kind: 'success'; token: string };

export function IdentifyForm({ code, diagnosisTitle, diagnosisType, cohortName }: Props) {
  const [name, setName] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    if (!/^\d{4}$/.test(phoneLast4)) {
      setError('전화번호 뒷 4자리를 숫자로 입력해주세요.');
      return;
    }

    setStatus({ kind: 'verifying' });
    startTransition(async () => {
      const r = await identifyAndStart(code, name, phoneLast4);
      if (!r.ok) {
        setStatus({ kind: 'idle' });
        setError(r.error);
        return;
      }
      setStatus({ kind: 'success', token: r.token });
      // 성공 애니메이션 잠깐 보여주고 이동
      setTimeout(() => {
        router.push(`/diagnosis/${r.token}`);
      }, 1400);
    });
  };

  return (
    <div className='w-full'>
      <AnimatePresence mode='wait'>
        {status.kind === 'verifying' && (
          <motion.div
            key='verifying'
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className='rounded-2xl border bg-white px-8 py-14 text-center shadow-lg'
          >
            <Spinner />
            <p className='mt-6 text-sm font-semibold text-slate-700'>
              본인 정보를 확인하고 있습니다
            </p>
            <p className='mt-1 text-xs text-slate-400'>잠시만 기다려주세요</p>
          </motion.div>
        )}

        {status.kind === 'success' && (
          <motion.div
            key='success'
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className='rounded-2xl border bg-white px-8 py-14 text-center shadow-lg'
          >
            <CheckmarkAnimation />
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              className='mt-4 text-lg font-bold text-slate-900'
            >
              {name.trim()}님, 확인되었습니다
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.3 }}
              className='mt-2 text-sm text-slate-500'
            >
              평가 페이지로 이동 중입니다
            </motion.p>
          </motion.div>
        )}

        {status.kind === 'idle' && (
          <motion.div
            key='form'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <div className='mx-auto mb-6 h-1 w-16 rounded-full bg-gradient-to-r from-blue-500 to-violet-500' />
            <form
              onSubmit={handleSubmit}
              className='rounded-2xl border bg-white px-8 py-8 shadow-lg'
            >
              <div className='mb-6 text-center'>
                <div className='mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400'>
                  {cohortName} · {diagnosisType === 'pre' ? '사전 평가' : '사후 평가'}
                </div>
                <h1 className='text-lg font-bold text-slate-900'>{diagnosisTitle}</h1>
              </div>

              <label className='mb-4 block'>
                <span className='mb-1.5 block text-xs font-semibold text-slate-700'>이름</span>
                <input
                  type='text'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='홍길동'
                  autoFocus
                  className='w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                />
              </label>

              <label className='mb-4 block'>
                <span className='mb-1.5 block text-xs font-semibold text-slate-700'>
                  전화번호 뒷 4자리
                </span>
                <input
                  type='tel'
                  inputMode='numeric'
                  pattern='\d{4}'
                  maxLength={4}
                  value={phoneLast4}
                  onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, ''))}
                  placeholder='5678'
                  className='w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                />
                <span className='mt-1 block text-[11px] text-slate-400'>
                  예: 010-1234-<strong>5678</strong> → 5678
                </span>
              </label>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className='mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-center text-sm text-red-700'
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type='submit'
                className='w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white transition-all hover:from-blue-700 hover:to-blue-800 active:scale-[0.98]'
              >
                확인
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Spinner() {
  return (
    <div className='relative mx-auto h-14 w-14'>
      <motion.div
        className='absolute inset-0 rounded-full border-4 border-blue-100'
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className='absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600'
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

function CheckmarkAnimation() {
  return (
    <motion.div
      initial={{ scale: 0.4 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 14 }}
      className='mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-200'
    >
      <svg viewBox='0 0 24 24' className='h-12 w-12' fill='none' stroke='white' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round'>
        <motion.path
          d='M5 12l5 5L20 7'
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.2, duration: 0.4, ease: 'easeOut' }}
        />
      </svg>
    </motion.div>
  );
}
