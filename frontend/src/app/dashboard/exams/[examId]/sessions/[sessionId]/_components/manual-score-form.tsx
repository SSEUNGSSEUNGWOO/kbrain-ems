'use client';

import { useState, useTransition } from 'react';
import { saveManualScore } from '../../../_actions';
import { Badge } from '@/components/ui/badge';

type Props = {
  examId: string;
  sessionId: string;
  questionId: string;
  maxScore: number;
  currentScore: number | null;
  currentFeedback: string | null;
};

export function ManualScoreForm(props: Props) {
  const { examId, sessionId, questionId, maxScore, currentScore, currentFeedback } = props;
  const [score, setScore] = useState<string>(currentScore != null ? String(currentScore) : '');
  const [feedback, setFeedback] = useState<string>(currentFeedback ?? '');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const onSave = () => {
    setMsg(null);
    const n = parseInt(score, 10);
    if (Number.isNaN(n)) {
      setMsg({ tone: 'err', text: '점수는 정수로 입력하세요.' });
      return;
    }
    startTransition(async () => {
      const res = await saveManualScore({
        examId,
        sessionId,
        questionId,
        score: n,
        feedback: feedback.trim() || null
      });
      if (res.error) setMsg({ tone: 'err', text: res.error });
      else setMsg({ tone: 'ok', text: '저장됨' });
    });
  };

  return (
    <div className='rounded-md border bg-blue-50/40 p-3 space-y-2'>
      <div className='flex items-center gap-2 text-xs font-semibold text-blue-900'>
        <Badge variant='outline' className='bg-blue-100 border-blue-300 text-blue-800'>
          수동 채점
        </Badge>
        <span className='text-muted-foreground font-normal'>배점 {maxScore}점</span>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <input
          type='number'
          min={0}
          max={maxScore}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className='w-24 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
          placeholder='점수'
        />
        <span className='text-xs text-muted-foreground'>/ {maxScore}점</span>
        <input
          type='text'
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className='flex-1 min-w-[180px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
          placeholder='피드백 (선택)'
        />
        <button
          type='button'
          onClick={onSave}
          disabled={pending}
          className='rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5'
        >
          {pending ? '저장 중...' : '저장'}
        </button>
      </div>
      {msg && (
        <p className={`text-xs ${msg.tone === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
