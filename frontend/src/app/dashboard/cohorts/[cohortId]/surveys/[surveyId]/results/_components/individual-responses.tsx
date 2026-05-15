'use client';

import { useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

const LIKERT10_LABELS = [
  '매우 불만족',
  '',
  '',
  '',
  '보통',
  '',
  '',
  '',
  '',
  '매우 만족'
] as const;

export type QuestionInfo = {
  id: string;
  displayNo: string;
  type: 'likert10' | 'text';
  text: string;
  sectionNo: number;
  sectionTitle: string;
  instructorName: string | null;
  isFollowUp: boolean;
};

export type ResponseRow = {
  no: number;
  submittedAt: string;
  avg: number | null;
  likertCount: number;
  answers: Record<string, number | string>;
};

type Props = {
  rows: ResponseRow[];
  questions: QuestionInfo[];
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function scoreText(avg: number | null) {
  if (avg === null) return 'text-muted-foreground';
  if (avg >= 9.0) return 'text-emerald-700 dark:text-emerald-300';
  if (avg >= 8.0) return 'text-blue-700 dark:text-blue-300';
  if (avg >= 7.0) return 'text-amber-700 dark:text-amber-300';
  if (avg >= 6.0) return 'text-orange-700 dark:text-orange-300';
  return 'text-red-700 dark:text-red-300';
}

export function IndividualResponses({ rows, questions }: Props) {
  const [openNo, setOpenNo] = useState<number | null>(null);

  const sections = useMemo(() => {
    const map = new Map<number, { sectionNo: number; title: string; items: QuestionInfo[] }>();
    for (const q of questions) {
      const entry = map.get(q.sectionNo) ?? {
        sectionNo: q.sectionNo,
        title: q.sectionTitle,
        items: []
      };
      entry.items.push(q);
      map.set(q.sectionNo, entry);
    }
    return Array.from(map.values()).toSorted((a, b) => a.sectionNo - b.sectionNo);
  }, [questions]);

  const current = openNo !== null ? rows.find((r) => r.no === openNo) ?? null : null;

  return (
    <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
      <div className='mb-4 flex items-baseline justify-between'>
        <h2 className='text-sm font-bold'>개별 응답</h2>
        <span className='text-xs text-muted-foreground'>총 {rows.length}건</span>
      </div>

      {rows.length === 0 ? (
        <p className='text-xs text-muted-foreground'>제출된 응답이 없습니다.</p>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {rows.map((r) => (
            <li key={r.no}>
              <button
                type='button'
                onClick={() => setOpenNo(r.no)}
                className='flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-muted/50'
              >
                <span className='w-10 shrink-0 text-xs font-bold tabular-nums text-blue-600 dark:text-blue-400'>
                  #{r.no}
                </span>
                <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>
                  {formatDateTime(r.submittedAt)}
                </span>
                <span className='flex-1' />
                <span className='shrink-0 text-xs text-muted-foreground'>
                  평균{' '}
                  <span className={`font-bold tabular-nums ${scoreText(r.avg)}`}>
                    {r.avg !== null ? r.avg.toFixed(2) : '-'}
                  </span>{' '}
                  / 10
                </span>
                <span className='shrink-0 text-muted-foreground/60' aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={openNo !== null} onOpenChange={(o) => !o && setOpenNo(null)}>
        <SheetContent side='right' className='w-full overflow-hidden p-0 sm:max-w-xl'>
          <SheetHeader className='border-b'>
            <SheetTitle className='flex items-baseline gap-2'>
              <span className='text-blue-600 dark:text-blue-400'>#{current?.no}</span>
              <span>응답 상세</span>
            </SheetTitle>
            <SheetDescription>
              {current && (
                <>
                  제출 {formatDateTime(current.submittedAt)} · 평균{' '}
                  <span className={`font-bold tabular-nums ${scoreText(current.avg)}`}>
                    {current.avg !== null ? current.avg.toFixed(2) : '-'}
                  </span>{' '}
                  / 10 ({current.likertCount}건)
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className='h-[calc(100dvh-7rem)]'>
            <div className='space-y-6 px-6 py-5'>
              {current &&
                sections.map((section) => (
                  <div key={section.sectionNo}>
                    <div className='mb-2 flex items-baseline gap-2 border-b pb-1.5'>
                      <span className='text-xs font-bold text-blue-600 dark:text-blue-400'>
                        {section.sectionNo}.
                      </span>
                      <span className='text-sm font-bold'>{section.title}</span>
                    </div>
                    <ul className='space-y-3'>
                      {section.items.map((q) => (
                        <li key={q.id} className={q.isFollowUp ? 'pl-4' : ''}>
                          <AnswerRow question={q} value={current.answers[q.id]} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function AnswerRow({
  question,
  value
}: {
  question: QuestionInfo;
  value: number | string | undefined;
}) {
  const empty = value === undefined || value === '' || value === null;

  return (
    <div>
      <div className='flex items-baseline gap-1.5 text-xs leading-snug'>
        {question.isFollowUp && (
          <span className='text-amber-600 dark:text-amber-400' aria-hidden>
            ↳
          </span>
        )}
        <span className='font-bold text-blue-600 dark:text-blue-400'>Q{question.displayNo}.</span>
        <span className='text-slate-700 dark:text-slate-200'>{question.text}</span>
        {question.instructorName && (
          <span className='rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'>
            {question.instructorName}
          </span>
        )}
      </div>

      <div className='mt-1.5'>
        {empty ? (
          <span className='text-xs text-muted-foreground'>미응답</span>
        ) : question.type === 'likert10' && typeof value === 'number' ? (
          <span className='inline-flex items-baseline gap-2 rounded-md bg-muted/60 px-2.5 py-1'>
            <span className={`text-base font-bold tabular-nums ${scoreText(value)}`}>{value}</span>
            <span className='text-[11px] text-muted-foreground'>
              {LIKERT10_LABELS[value - 1] ?? ''}
            </span>
          </span>
        ) : (
          <p className='whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm'>
            {String(value)}
          </p>
        )}
      </div>
    </div>
  );
}
