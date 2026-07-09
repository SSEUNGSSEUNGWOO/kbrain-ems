'use client';

import { useState, useTransition } from 'react';
import { saveManualScore } from '../../../../_actions';
import { Badge } from '@/components/ui/badge';

export type RubricItem = {
  id: string;
  label: string;
  max: number;
  desc?: string;
};

type Props = {
  examId: string;
  sessionId: string;
  questionId: string;
  maxScore: number;
  currentScore: number | null;
  currentFeedback: string | null;
  // rubric 있으면 항목별 채점 UI 렌더. 없으면 기존 단일 총점 UI.
  rubric?: RubricItem[] | null;
  currentRubricScores?: Record<string, number> | null;
};

export function ManualScoreForm(props: Props) {
  const {
    examId,
    sessionId,
    questionId,
    maxScore,
    currentScore,
    currentFeedback,
    rubric,
    currentRubricScores
  } = props;
  const hasRubric = Array.isArray(rubric) && rubric.length > 0;

  const [rubricScores, setRubricScores] = useState<Record<string, string>>(() => {
    if (!hasRubric) return {};
    const init: Record<string, string> = {};
    for (const r of rubric!) {
      init[r.id] = currentRubricScores?.[r.id] != null ? String(currentRubricScores[r.id]) : '';
    }
    return init;
  });
  const [score, setScore] = useState<string>(currentScore != null ? String(currentScore) : '');
  const [feedback, setFeedback] = useState<string>(currentFeedback ?? '');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const rubricMax = hasRubric ? rubric!.reduce((sum, r) => sum + r.max, 0) : 0;
  const rubricSum = hasRubric
    ? rubric!.reduce((sum, r) => {
        const v = parseInt(rubricScores[r.id] ?? '', 10);
        return sum + (Number.isNaN(v) ? 0 : v);
      }, 0)
    : 0;
  // 실제 저장되는 스케일 점수 (문항 만점 기준)
  const scaledScore = hasRubric ? Math.round((rubricSum * maxScore) / (rubricMax || 100)) : 0;

  const onSave = () => {
    setMsg(null);
    startTransition(async () => {
      if (hasRubric) {
        // 각 항목 값 검증
        const values: Record<string, number> = {};
        for (const r of rubric!) {
          const raw = rubricScores[r.id]?.trim() ?? '';
          if (raw === '') continue;
          const n = parseInt(raw, 10);
          if (Number.isNaN(n)) {
            setMsg({ tone: 'err', text: `${r.label} 점수는 정수여야 합니다.` });
            return;
          }
          if (n < 0 || n > r.max) {
            setMsg({ tone: 'err', text: `${r.label} 점수는 0~${r.max} 범위여야 합니다.` });
            return;
          }
          values[r.id] = n;
        }
        const res = await saveManualScore({
          examId,
          sessionId,
          questionId,
          rubric_scores: values,
          feedback: feedback.trim() || null
        });
        if (res.error) setMsg({ tone: 'err', text: res.error });
        else setMsg({ tone: 'ok', text: `저장됨 (${rubricSum}/100 → ${scaledScore}/${maxScore})` });
      } else {
        const n = parseInt(score, 10);
        if (Number.isNaN(n)) {
          setMsg({ tone: 'err', text: '점수는 정수로 입력하세요.' });
          return;
        }
        const res = await saveManualScore({
          examId,
          sessionId,
          questionId,
          score: n,
          feedback: feedback.trim() || null
        });
        if (res.error) setMsg({ tone: 'err', text: res.error });
        else setMsg({ tone: 'ok', text: '저장됨' });
      }
    });
  };

  return (
    <div className='rounded-md border bg-blue-50/40 p-4 space-y-3'>
      <div className='flex items-center gap-2 text-xs font-semibold text-blue-900'>
        <Badge variant='outline' className='bg-blue-100 border-blue-300 text-blue-800'>
          수동 채점
        </Badge>
        {hasRubric ? (
          <span className='text-muted-foreground font-normal'>
            채점 기준 · rubric {rubricMax}점 → 문항 만점 {maxScore}점
          </span>
        ) : (
          <span className='text-muted-foreground font-normal'>배점 {maxScore}점</span>
        )}
      </div>

      {hasRubric ? (
        <div className='space-y-2'>
          {rubric!.map((r) => (
            <div
              key={r.id}
              className='grid grid-cols-[1fr_auto] gap-3 items-start rounded-md bg-white/70 border border-blue-100 px-3 py-2'
            >
              <div className='min-w-0'>
                <div className='flex items-baseline gap-2'>
                  <span className='text-sm font-semibold text-slate-900'>{r.label}</span>
                  <span className='text-xs text-slate-500'>/ {r.max}점</span>
                </div>
                {r.desc && <div className='text-[11px] text-slate-500 mt-0.5'>{r.desc}</div>}
              </div>
              <input
                type='number'
                min={0}
                max={r.max}
                value={rubricScores[r.id] ?? ''}
                onChange={(e) =>
                  setRubricScores((prev) => ({ ...prev, [r.id]: e.target.value }))
                }
                className='w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-right tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
                placeholder='0'
              />
            </div>
          ))}
          {/* 합계·환산 표시 */}
          <div className='flex items-center justify-between rounded-md bg-blue-100/50 border border-blue-300 px-3 py-2 text-sm'>
            <span className='text-blue-900 font-semibold'>합계</span>
            <span className='tabular-nums font-mono text-blue-900'>
              <span className='font-bold text-base'>{rubricSum}</span>
              <span className='text-slate-500'>/{rubricMax}</span>
              <span className='mx-2 text-slate-400'>→</span>
              <span className='font-bold text-base'>{scaledScore}</span>
              <span className='text-slate-500'>/{maxScore} 문항 저장</span>
            </span>
          </div>
        </div>
      ) : (
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
        </div>
      )}

      <div className='flex items-center gap-2'>
        <input
          type='text'
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className='flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
          placeholder='피드백 (선택)'
        />
        <button
          type='button'
          onClick={onSave}
          disabled={pending}
          className='rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5'
        >
          {pending ? '저장 중…' : '저장'}
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
