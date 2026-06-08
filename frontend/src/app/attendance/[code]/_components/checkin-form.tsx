'use client';

import { useEffect, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { checkinByShareCode } from '../_actions';

type Props = {
  code: string;
  label: string;
  cohortName: string;
  sessionLabel: string;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'verifying' }
  | { kind: 'success'; studentName: string; checkedAt: string; alreadyChecked: boolean };

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function CheckinForm({ code, label, cohortName, sessionLabel }: Props) {
  const [name, setName] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [, startTransition] = useTransition();
  const [confirmTime, setConfirmTime] = useState('');

  // 확인 화면에서 매초 시간 업데이트
  useEffect(() => {
    if (status.kind !== 'confirming') return;
    setConfirmTime(nowHHMM());
    const id = setInterval(() => setConfirmTime(nowHHMM()), 1000);
    return () => clearInterval(id);
  }, [status.kind]);

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
    setStatus({ kind: 'confirming' });
  };

  const doCheckin = () => {
    setStatus({ kind: 'verifying' });
    startTransition(async () => {
      const r = await checkinByShareCode(code, name, phoneLast4);
      if (!r.ok) {
        setStatus({ kind: 'idle' });
        setError(r.error);
        return;
      }
      setStatus({
        kind: 'success',
        studentName: r.studentName,
        checkedAt: r.checkedAt,
        alreadyChecked: r.alreadyChecked
      });
    });
  };

  return (
    <div className='w-full'>
      <AnimatePresence mode='wait'>
        {status.kind === 'confirming' && (
          <motion.div
            key='confirming'
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className='rounded-2xl border bg-white px-8 py-10 text-center shadow-lg'
          >
            <div className='mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400'>
              {cohortName ? `${cohortName} · ` : ''}출석 체크
            </div>
            <h1 className='mb-6 text-lg font-bold text-slate-900'>{label}</h1>
            <div className='mx-auto mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700'>
              {name}
            </div>
            <p className='text-sm text-slate-700'>
              지금 시각{' '}
              <motion.span
                key={confirmTime}
                initial={{ opacity: 0.4, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                className='font-mono text-2xl font-bold text-slate-900 tabular-nums'
              >
                {confirmTime}
              </motion.span>
              {' '}에 출석하시겠습니까?
            </p>
            <p className='mt-2 text-[11px] text-slate-500'>
              제출 시각이 기록됩니다. 확인 후 변경할 수 없어요.
            </p>
            <div className='mt-7 flex gap-3'>
              <button
                type='button'
                onClick={() => setStatus({ kind: 'idle' })}
                className='flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50'
              >
                취소
              </button>
              <button
                type='button'
                onClick={doCheckin}
                className='flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.98]'
              >
                지금 출석
              </button>
            </div>
          </motion.div>
        )}

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
              {status.studentName}님
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.3 }}
              className='mt-1 text-sm text-slate-600'
            >
              {status.alreadyChecked ? '이미 체크인되어 있습니다' : '출석 체크인 완료'}
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.85, duration: 0.3 }}
              className='mt-5 inline-block rounded-xl bg-blue-50 px-4 py-2 text-xs text-blue-800'
            >
              {label} · {new Date(status.checkedAt).toLocaleTimeString('ko-KR')}
            </motion.div>
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
                  {cohortName ? `${cohortName} · ` : ''}출석 체크
                </div>
                <h1 className='text-lg font-bold text-slate-900'>{label}</h1>
                {sessionLabel && (
                  <p className='mt-1 text-xs text-slate-500'>{sessionLabel}</p>
                )}
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
                출석 체크인
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
      <svg
        viewBox='0 0 24 24'
        className='h-12 w-12'
        fill='none'
        stroke='white'
        strokeWidth='3'
        strokeLinecap='round'
        strokeLinejoin='round'
      >
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
