'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { submitBallot } from '../_actions';

type Candidate = {
  id: string;
  order_no: number;
  presenter: string;
  topic: string | null;
  cover_image_url: string | null;
};

type Props = {
  code: string;
  title: string;
  description: string | null;
  maxSelections: number;
  candidates: Candidate[];
};

const STORAGE_KEY = (code: string) => `vote:${code}:done`;

function ensureDeviceKey(): string {
  const existing = localStorage.getItem('vote:device_key');
  if (existing) return existing;
  const k = crypto.randomUUID();
  localStorage.setItem('vote:device_key', k);
  return k;
}

export function VoteForm({ code, title, description, maxSelections, candidates }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY(code))) setAlreadyVoted(true);
  }, [code]);

  const isFull = selected.length >= maxSelections;
  const selectedCandidates = selected
    .map((id) => candidates.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Candidate => candidate !== undefined);

  const toggle = (id: string) => {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxSelections) return prev;
      return [...prev, id];
    });
  };

  const submit = () => {
    setError(null);
    if (selected.length !== maxSelections) {
      setError(`정확히 ${maxSelections}명을 선택해주세요.`);
      return;
    }
    const deviceKey = ensureDeviceKey();
    startTransition(async () => {
      const res = await submitBallot(code, { candidateIds: selected, deviceKey });
      if (res.alreadyVoted) {
        localStorage.setItem(STORAGE_KEY(code), '1');
        setAlreadyVoted(true);
        return;
      }
      if (res.error) {
        setError(res.error);
        return;
      }
      localStorage.setItem(STORAGE_KEY(code), '1');
      router.push(`/vote/${code}/done`);
    });
  };

  if (alreadyVoted) {
    return (
      <div className='mx-auto flex min-h-screen max-w-lg items-center justify-center px-4'>
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className='rounded-2xl border bg-card px-8 py-12 text-center shadow-sm'
        >
          <div className='mb-2 text-lg font-semibold'>이미 투표하셨습니다</div>
          <div className='text-muted-foreground text-sm'>1인 1회만 참여 가능합니다.</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-slate-50 dark:bg-slate-950'>
      <div className='mx-auto max-w-4xl px-3 py-8 pb-40 sm:px-4 sm:py-10'>
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className='mb-8 text-center'
        >
          <h1 className='text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100'>
            {title}
          </h1>
          {description && <p className='text-muted-foreground mt-2 text-sm'>{description}</p>}
        </motion.div>

        <div className='sticky top-4 z-20 mb-6 flex justify-center'>
          <motion.div
            layout
            className={`rounded-full border px-5 py-1.5 shadow-sm backdrop-blur-md transition-colors ${
              isFull
                ? 'border-indigo-300 bg-white/95 text-indigo-700 dark:border-indigo-700 dark:bg-slate-900/95 dark:text-indigo-300'
                : 'border-slate-200 bg-white/95 text-slate-700 dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300'
            }`}
          >
            <div className='flex items-center gap-1.5 text-sm font-semibold tabular-nums'>
              <AnimatePresence mode='popLayout'>
                <motion.span
                  key={selected.length}
                  initial={{ y: -6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 6, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                >
                  {selected.length}
                </motion.span>
              </AnimatePresence>
              <span className='text-muted-foreground'>/</span>
              <span>{maxSelections}</span>
              <span className='text-muted-foreground ml-1 text-xs font-normal'>선택</span>
            </div>
          </motion.div>
        </div>

        <div className='grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4'>
          {candidates.map((c, i) => {
            const isOn = selected.includes(c.id);
            const disabled = !isOn && isFull;
            return (
              <motion.button
                key={c.id}
                type='button'
                onClick={() => toggle(c.id)}
                disabled={disabled}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: disabled ? 0.45 : 1, y: 0 }}
                transition={{ delay: i * 0.025, type: 'spring', stiffness: 220, damping: 24 }}
                whileHover={disabled ? {} : { y: -3 }}
                whileTap={disabled ? {} : { scale: 0.98 }}
                className={`relative text-left ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  className={`overflow-hidden rounded-xl border-2 bg-card transition-colors ${
                    isOn
                      ? 'border-indigo-500 shadow-md shadow-indigo-500/10'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className='bg-muted relative aspect-video overflow-hidden'>
                    {c.cover_image_url ? (
                      <Image
                        src={c.cover_image_url}
                        alt={c.presenter}
                        fill
                        className='object-cover'
                        sizes='(max-width: 640px) 100vw, 320px'
                        unoptimized
                      />
                    ) : (
                      <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
                        표지 없음
                      </div>
                    )}
                    <AnimatePresence>
                      {isOn && (
                        <>
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className='absolute inset-0 bg-indigo-500/10'
                          />
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                            className='absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow-md sm:right-3 sm:top-3 sm:h-9 sm:w-9 sm:text-lg'
                          >
                            ✓
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className='flex flex-col gap-0.5 px-3 py-2.5 sm:px-4 sm:py-3'>
                    <div className='flex items-baseline gap-1.5 sm:gap-2'>
                      <span className='text-muted-foreground font-mono text-xs'>{c.order_no}</span>
                      <span className='truncate text-sm font-semibold'>{c.presenter}</span>
                    </div>
                    {c.topic && (
                      <div className='text-muted-foreground line-clamp-2 text-xs leading-snug'>
                        {c.topic}
                      </div>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className='mt-4 text-center text-sm font-medium text-rose-600'
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className='fixed bottom-0 left-0 right-0 z-30 border-t bg-white/95 backdrop-blur-md dark:bg-slate-900/95'>
        <div className='mx-auto max-w-4xl px-4 py-3'>
          {selectedCandidates.length > 0 && (
            <div className='mb-2 flex min-w-0 items-center gap-2 text-xs'>
              <span className='shrink-0 font-semibold text-indigo-700 dark:text-indigo-300'>
                선택한 발표자
              </span>
              <span className='text-muted-foreground truncate'>
                {selectedCandidates.map((candidate) => candidate.presenter).join(' · ')}
              </span>
            </div>
          )}
          <Button
            onClick={submit}
            disabled={pending || !isFull}
            size='lg'
            className={`w-full text-sm font-semibold ${
              isFull ? 'bg-indigo-600 text-white hover:bg-indigo-700' : ''
            }`}
          >
            {pending
              ? '제출 중...'
              : isFull
                ? `${maxSelections}명 선택 완료 — 제출하기`
                : `${maxSelections - selected.length}명 더 선택해주세요`}
          </Button>
        </div>
      </div>
    </div>
  );
}
