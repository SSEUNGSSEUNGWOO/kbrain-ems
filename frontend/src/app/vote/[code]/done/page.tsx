'use client';

import { motion } from 'motion/react';

export default function VoteDonePage() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950'>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className='w-full max-w-md rounded-2xl border bg-card px-8 py-12 text-center shadow-sm'
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 18 }}
          className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/50'
        >
          <motion.svg
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5, ease: 'easeOut' }}
            viewBox='0 0 24 24'
            className='h-7 w-7 text-indigo-600 dark:text-indigo-400'
            fill='none'
            stroke='currentColor'
            strokeWidth={3}
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <motion.path d='M5 12l5 5L20 7' />
          </motion.svg>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className='mb-1.5 text-lg font-semibold text-slate-900 dark:text-slate-100'
        >
          투표가 완료되었습니다
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className='text-muted-foreground text-sm'
        >
          참여해주셔서 감사합니다.
        </motion.div>
      </motion.div>
    </div>
  );
}
