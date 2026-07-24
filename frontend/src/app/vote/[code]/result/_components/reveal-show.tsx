'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';

type Winner = {
  id: string;
  order_no: number;
  presenter: string;
  topic: string | null;
  cover_image_url: string | null;
  votes: number;
};

type Props = {
  title: string;
  totalBallots: number;
  ranked: Winner[];
};

type Stage = 'idle' | 'r3' | 'r2' | 'r1' | 'all';

const NEXT: Record<Stage, Stage | null> = { idle: 'r3', r3: 'r2', r2: 'r1', r1: 'all', all: null };
const CTA: Record<Stage, string> = {
  idle: '결과 발표 시작',
  r3: '2위 공개',
  r2: '1위 공개',
  r1: '전체 순위 보기',
  all: ''
};

function CountUp({
  to,
  delay = 0,
  duration = 1600
}: {
  to: number;
  delay?: number;
  duration?: number;
}) {
  const [n, setN] = useState(0);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    let raf = 0;
    const startTimer = setTimeout(() => {
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setN(Math.round(to * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
        else {
          setPop(true);
          setTimeout(() => setPop(false), 300);
        }
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(raf);
    };
  }, [to, delay, duration]);
  return (
    <motion.span animate={pop ? { scale: [1, 1.25, 1] } : {}} transition={{ duration: 0.3 }}>
      {n}
    </motion.span>
  );
}

const RANK_STYLE: Record<
  number,
  {
    number: string;
    accent: string;
    solidText: string;
  }
> = {
  1: {
    number: '1',
    accent: 'from-amber-400 via-yellow-500 to-amber-600',
    solidText: 'text-amber-300'
  },
  2: {
    number: '2',
    accent: 'from-slate-100 via-white to-slate-300',
    solidText: 'text-white'
  },
  3: {
    number: '3',
    accent: 'from-orange-300 via-orange-400 to-orange-500',
    solidText: 'text-orange-300'
  }
};

function selectionRate(votes: number, totalBallots: number): number {
  return totalBallots > 0 ? Math.round((votes / totalBallots) * 100) : 0;
}

function RevealScene({ w, rank, totalBallots }: { w: Winner; rank: number; totalBallots: number }) {
  const s = RANK_STYLE[rank];
  return (
    <div className='relative flex min-h-screen w-full items-center overflow-hidden bg-[#090909] px-6 py-16 text-white sm:px-10 lg:px-16'>
      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_45%,rgba(255,255,255,0.055),transparent_38%)]' />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className='pointer-events-none absolute -right-6 -top-24 select-none font-black leading-none text-white/[0.24]'
        style={{ fontSize: 'min(78vw, 105vh)' }}
      >
        {s.number}
      </motion.div>

      <div className='relative z-10 mx-auto grid w-full max-w-7xl items-stretch overflow-hidden border border-white/15 bg-[#1c1c1c] shadow-[0_28px_90px_rgba(0,0,0,0.4)] md:grid-cols-[1.15fr_0.85fr]'>
        <motion.div
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className='relative aspect-video overflow-hidden bg-white/[0.04]'
        >
          {w.cover_image_url ? (
            <Image
              src={w.cover_image_url}
              alt={w.presenter}
              fill
              className='object-cover'
              sizes='(max-width: 768px) 100vw, 720px'
              unoptimized
              priority
            />
          ) : (
            <div className='flex h-full items-center justify-center text-sm text-slate-500'>
              표지 없음
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className='flex flex-col justify-center border-white/15 px-8 py-10 sm:px-12 lg:border-l lg:px-16 lg:py-12'
        >
          <div className='flex items-baseline gap-3 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl'>
            <span>{w.presenter}</span>
            <span className='text-lg font-medium tracking-normal text-[#a3a3a3] sm:text-xl'>
              프로님
            </span>
          </div>
          {w.topic && (
            <div className='mt-4 max-w-xl text-base leading-relaxed text-[#c2c2c2] lg:text-lg'>
              {w.topic}
            </div>
          )}
          <div className='my-7 h-px bg-white/15' />
          <div className={`flex items-end gap-2 ${rank === 1 ? 'text-amber-400' : 'text-white'}`}>
            <span className='text-6xl font-black tabular-nums sm:text-7xl lg:text-8xl'>
              <CountUp to={w.votes} delay={1200} duration={1400} />
            </span>
            <span className='pb-2 text-xl font-bold text-[#d4d4d4]'>표</span>
            <span className='pb-2 pl-2 text-base font-semibold text-[#a3a3a3] sm:text-lg'>
              · {selectionRate(w.votes, totalBallots)}% 선택률
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function IdleScene({ title, totalBallots }: { title: string; totalBallots: number }) {
  return (
    <div className='relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 text-center text-white'>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.08 }}
        transition={{ duration: 1.5 }}
        className='absolute inset-0 bg-[radial-gradient(circle_at_top,white,transparent_60%)]'
      />
      <motion.div
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className='relative z-10'
      >
        <div className='text-xs font-bold uppercase tracking-[0.35em] text-amber-400'>
          결과 발표
        </div>
        <h1 className='mt-4 text-3xl font-black sm:text-5xl'>{title}</h1>
        <div className='text-muted-foreground mt-3 text-sm'>총 {totalBallots}명 응답</div>
      </motion.div>
    </div>
  );
}

function FinalRankingCard({
  winner,
  rank,
  delay,
  totalBallots,
  featured = false
}: {
  winner: Winner;
  rank: number;
  delay: number;
  totalBallots: number;
  featured?: boolean;
}) {
  const s = RANK_STYLE[rank];
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative overflow-hidden border border-white/15 bg-[#1c1c1c] shadow-[0_20px_60px_rgba(0,0,0,0.28)] ${
        featured
          ? 'grid md:grid-cols-[1.35fr_1fr]'
          : 'grid grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]'
      }`}
    >
      <div
        className={`relative aspect-video overflow-hidden bg-[#101010] ${featured ? 'md:aspect-auto' : ''}`}
      >
        {winner.cover_image_url ? (
          <Image
            src={winner.cover_image_url}
            alt={winner.presenter}
            fill
            className='object-contain'
            sizes={featured ? '(max-width: 768px) 100vw, 640px' : '320px'}
            unoptimized
          />
        ) : (
          <div className='flex h-full items-center justify-center text-sm text-slate-500'>
            표지 없음
          </div>
        )}
      </div>

      <div
        className={`relative flex flex-col justify-center ${featured ? 'p-6 sm:p-8' : 'p-4 sm:p-6'}`}
      >
        <div className='mb-3 flex items-center justify-between gap-3'>
          <div
            className={`font-light tabular-nums ${rank === 1 ? 'text-amber-400' : 'text-slate-500'} ${featured ? 'text-5xl' : 'text-3xl'}`}
          >
            0{rank}
          </div>
          <div
            className={`font-black tabular-nums ${s.solidText} ${featured ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'}`}
          >
            {winner.votes}
            <span className='ml-1 text-sm font-bold'>표</span>
            <span className='ml-2 text-xs font-semibold text-slate-400'>
              · {selectionRate(winner.votes, totalBallots)}%
            </span>
          </div>
        </div>
        <div
          className={`flex items-baseline gap-2 font-black tracking-tight text-white ${featured ? 'text-3xl sm:text-4xl' : 'text-lg sm:text-2xl'}`}
        >
          <span>{winner.presenter}</span>
          <span
            className={`font-medium tracking-normal text-slate-400 ${featured ? 'text-base' : 'text-xs sm:text-sm'}`}
          >
            프로님
          </span>
        </div>
        {winner.topic && (
          <div
            className={`mt-2 text-slate-400 ${featured ? 'text-sm sm:text-base' : 'line-clamp-2 text-xs sm:text-sm'}`}
          >
            {winner.topic}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AllScene({
  title,
  first,
  second,
  third,
  totalBallots
}: {
  title: string;
  first?: Winner;
  second?: Winner;
  third?: Winner;
  totalBallots: number;
}) {
  return (
    <div className='relative flex min-h-screen w-full items-center overflow-hidden bg-[#090909] px-5 py-8 text-white sm:px-8'>
      <div className='relative mx-auto w-full max-w-7xl'>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className='mb-7 text-center sm:mb-9'
        >
          <div className='text-xs font-semibold tracking-[0.3em] text-slate-500'>최종 순위</div>
          <h1 className='mt-2 text-2xl font-bold sm:text-3xl'>{title}</h1>
          <div className='text-muted-foreground mt-1 text-sm'>총 {totalBallots}명 응답</div>
        </motion.div>

        <div className='space-y-4 sm:space-y-5'>
          {first && (
            <FinalRankingCard
              winner={first}
              rank={1}
              delay={0}
              totalBallots={totalBallots}
              featured
            />
          )}
          <div className='grid gap-4 md:grid-cols-2 sm:gap-5'>
            {second && (
              <FinalRankingCard winner={second} rank={2} delay={0.15} totalBallots={totalBallots} />
            )}
            {third && (
              <FinalRankingCard winner={third} rank={3} delay={0.3} totalBallots={totalBallots} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RevealShow({ title, totalBallots, ranked }: Props) {
  const [stage, setStage] = useState<Stage>('idle');

  const [first, second, third] = ranked;

  const goNext = () => {
    const nx = NEXT[stage];
    if (nx) setStage(nx);
  };

  return (
    <div className='relative min-h-screen w-full'>
      <AnimatePresence mode='wait'>
        {stage === 'idle' && (
          <motion.div
            key='idle'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <IdleScene title={title} totalBallots={totalBallots} />
          </motion.div>
        )}
        {stage === 'r3' && third && (
          <motion.div
            key='r3'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <RevealScene w={third} rank={3} totalBallots={totalBallots} />
          </motion.div>
        )}
        {stage === 'r2' && second && (
          <motion.div
            key='r2'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <RevealScene w={second} rank={2} totalBallots={totalBallots} />
          </motion.div>
        )}
        {stage === 'r1' && first && (
          <motion.div
            key='r1'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <RevealScene w={first} rank={1} totalBallots={totalBallots} />
          </motion.div>
        )}
        {stage === 'all' && (
          <motion.div
            key='all'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AllScene
              title={title}
              first={first}
              second={second}
              third={third}
              totalBallots={totalBallots}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {stage !== 'all' && (
        <div className='fixed bottom-6 left-1/2 z-30 -translate-x-1/2'>
          <Button
            size='lg'
            className='bg-white px-10 text-slate-950 shadow-2xl hover:bg-slate-100'
            onClick={goNext}
          >
            {CTA[stage]}
          </Button>
        </div>
      )}
    </div>
  );
}
