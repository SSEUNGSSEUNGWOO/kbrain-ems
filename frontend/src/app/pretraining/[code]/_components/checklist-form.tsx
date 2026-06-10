'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitChecklistResponse } from '../_actions';

type Item = {
  id: string;
  question_no: string;
  text: string;
  guide_url: string | null;
  parent_id: string | null;
  parent_answer: string | null;
  no_hint: string | null;
};

type Props = {
  checklistId: string;
  items: Item[];
};

export function ChecklistForm({ checklistId, items }: Props) {
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no'>>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 부모 답에 따라 현재 노출돼야 할 항목들
  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (!it.parent_id) return true;
      const parentAns = answers[it.parent_id];
      return parentAns === (it.parent_answer ?? 'yes');
    });
  }, [items, answers]);

  const setAnswer = (id: string, value: 'yes' | 'no') => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      // 부모 답이 바뀌어 자식이 더 이상 안 보이면 자식 답 정리
      for (const it of items) {
        if (it.parent_id === id && it.parent_answer !== value) {
          delete next[it.id];
        }
      }
      return next;
    });
  };

  const allAnswered = visibleItems.every((it) => answers[it.id] === 'yes' || answers[it.id] === 'no');
  const canSubmit = name.trim().length > 0 && allAnswered && !pending;

  const onSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await submitChecklistResponse(checklistId, {
        name,
        organization,
        phone,
        answers
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  if (submitted) {
    return (
      <div className='rounded-xl border bg-emerald-50/50 px-6 py-12 text-center shadow-sm'>
        <div className='text-lg font-bold text-emerald-700'>응답이 제출되었습니다</div>
        <p className='mt-2 text-sm text-emerald-700/80'>참여해주셔서 감사합니다.</p>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-5'>
      {/* 응답자 정보 */}
      <section className='rounded-xl border bg-white px-6 py-5 shadow-sm'>
        <h2 className='mb-3 text-sm font-bold text-slate-900'>응답자 정보</h2>
        <div className='grid gap-3'>
          <div className='grid gap-1.5'>
            <Label htmlFor='name'>입과자 성함 *</Label>
            <Input id='name' value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='org'>소속</Label>
            <Input id='org' value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='phone'>휴대전화번호</Label>
            <Input
              id='phone'
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder='010-1234-5678'
            />
          </div>
        </div>
      </section>

      {/* 항목 */}
      <section className='flex flex-col gap-3'>
        {visibleItems.map((it) => {
          const ans = answers[it.id];
          return (
            <div key={it.id} className='rounded-xl border bg-white px-5 py-4 shadow-sm'>
              <div className='flex items-start gap-2'>
                <span className='text-muted-foreground mt-0.5 font-mono text-xs'>
                  {it.question_no}.
                </span>
                <div className='flex-1'>
                  <div className='text-sm text-slate-900'>{it.text}</div>
                  {it.guide_url && (
                    <a
                      href={it.guide_url}
                      target='_blank'
                      rel='noreferrer'
                      className='mt-1 inline-block text-xs text-blue-600 hover:underline'
                    >
                      {it.guide_url}
                    </a>
                  )}
                </div>
              </div>
              <div className='mt-3 flex gap-2'>
                <button
                  type='button'
                  onClick={() => setAnswer(it.id, 'yes')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    ans === 'yes'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  예
                </button>
                <button
                  type='button'
                  onClick={() => setAnswer(it.id, 'no')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    ans === 'no'
                      ? 'border-rose-500 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  아니오
                </button>
              </div>
              {ans === 'no' && it.no_hint && (
                <div className='mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800'>
                  💡 {it.no_hint}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {error && (
        <div className='rounded-md bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</div>
      )}

      <Button
        type='button'
        onClick={onSubmit}
        disabled={!canSubmit}
        className='h-12 text-base'
      >
        {pending ? '제출 중...' : allAnswered ? '제출하기' : '모든 항목에 답해주세요'}
      </Button>
    </div>
  );
}
