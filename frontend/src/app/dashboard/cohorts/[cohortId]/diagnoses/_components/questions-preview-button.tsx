'use client';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';

export type PreviewQuestion = {
  id: string;
  question_no: number;
  type: string;
  text: string;
  options: Record<string, unknown> | null;
  weight: string | null;
};

type Props = {
  questions: PreviewQuestion[];
};

export function QuestionsPreviewButton({ questions }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='outline'>문항 확인</Button>
      </SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>문항 확인 (사전·사후 공통)</SheetTitle>
        </SheetHeader>
        <div className='space-y-5 px-6 pb-8'>
          <p className='text-xs text-slate-500'>
            총 {questions.length}문항. 사전·사후 평가에 동일하게 사용됩니다. 학생에게는 정답·해설이 보이지 않습니다.
          </p>
          {questions.map((q) => (
            <QuestionPreviewCard key={q.id} q={q} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuestionPreviewCard({ q }: { q: PreviewQuestion }) {
  const typeLabel =
    q.type === 'multiple_choice' ? '4지선다' : q.type === 'ox' ? 'O/X' : '단답형';
  const opts = q.options ?? {};
  const choices =
    (opts.choices as { key: string; text: string }[] | undefined) ?? null;
  const correct = opts.correct as string | undefined;
  const keywords = opts.correct_keywords as string[] | undefined;

  return (
    <div className='rounded-xl border bg-white p-4'>
      <div className='mb-2 flex items-center gap-2'>
        <span className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700'>
          {q.question_no}
        </span>
        <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
          {typeLabel}
        </span>
        {q.weight && (
          <span className='text-[11px] text-slate-400'>{Number(q.weight)}점</span>
        )}
      </div>
      <p className='text-sm leading-relaxed text-slate-800'>{q.text}</p>

      {choices && (
        <div className='mt-3 space-y-1.5'>
          {choices.map((c) => {
            const isCorrect = c.key === correct;
            return (
              <div
                key={c.key}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  isCorrect
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <span className='mr-1.5 font-semibold'>{c.key}</span>
                {c.text}
                {isCorrect && (
                  <span className='ml-2 text-xs font-bold text-emerald-700'>✓ 정답</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {q.type === 'ox' && correct && (
        <div className='mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900'>
          정답: <span className='text-lg'>{correct}</span>
        </div>
      )}

      {q.type === 'short_text' && keywords && keywords.length > 0 && (
        <div className='mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm'>
          <div className='text-xs font-semibold text-emerald-900'>
            정답 키워드 (부분 포함 매칭)
          </div>
          <div className='mt-1 flex flex-wrap gap-1.5'>
            {keywords.map((k) => (
              <span
                key={k}
                className='rounded-full bg-white px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200'
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
