'use client';

import { useMemo, useState, useTransition } from 'react';
import { submitSurvey } from '../_actions';

type Question = {
  id: string;
  question_no: number;
  type: string;
  text: string;
  required: boolean;
  section_no: number | null;
  section_title: string | null;
  instructor_id: string | null;
  options: Record<string, unknown> | null;
};

type Props = {
  token: string;
  surveyTitle: string;
  studentName: string | null;
  questions: Question[];
};

// 척도 ≤ 임계값(불만족 이하)일 때만 직후 사유 입력칸을 노출
const FOLLOW_UP_THRESHOLD = 2;
const LIKERT5_LABELS = ['매우 불만족', '불만족', '보통', '만족', '매우 만족'] as const;

export function SurveyForm({ token, surveyTitle, studentName, questions }: Props) {
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 섹션별 그룹화
  const sections = useMemo(() => {
    const map = new Map<number, { title: string | null; items: Question[] }>();
    for (const q of questions) {
      const key = q.section_no ?? 0;
      const entry = map.get(key) ?? { title: q.section_title ?? null, items: [] };
      entry.items.push(q);
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([no, v]) => ({ no, ...v }));
  }, [questions]);

  // text 문항 → 직전 척도 문항 매핑 (follow-up 사유)
  const followUpMap = useMemo(() => {
    const map = new Map<string, string>();
    let prevScale: Question | null = null;
    for (const q of questions) {
      if (q.type === 'likert5') {
        prevScale = q;
      } else if (q.type === 'text' && prevScale) {
        const sameSection = prevScale.section_no === q.section_no;
        const sameInstructor = prevScale.instructor_id === q.instructor_id;
        if (sameSection && sameInstructor) {
          map.set(q.id, prevScale.id);
        }
        prevScale = null;
      } else {
        prevScale = null;
      }
    }
    return map;
  }, [questions]);

  const isQuestionVisible = (q: Question) => {
    const linkedScaleId = followUpMap.get(q.id);
    if (!linkedScaleId) return true;
    const score = responses[linkedScaleId];
    if (typeof score !== 'number') return false;
    return score <= FOLLOW_UP_THRESHOLD;
  };

  const setScale = (questionId: string, value: number) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  const setText = (questionId: string, value: string) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    for (const q of questions) {
      if (!q.required) continue;
      if (!isQuestionVisible(q)) continue;
      const v = responses[q.id];
      if (v === undefined || v === null || v === '') {
        setError(`필수 문항이 비어 있습니다: ${q.text}`);
        return;
      }
    }

    startTransition(async () => {
      const result = await submitSurvey({ token, responses });
      if ('error' in result) {
        setError(result.error);
      } else {
        setDone(true);
      }
    });
  };

  if (done) {
    return (
      <div className='rounded-2xl border bg-white px-8 py-12 text-center shadow-sm'>
        <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600'>
          <svg className='h-6 w-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M5 13l4 4L19 7' />
          </svg>
        </div>
        <h2 className='text-xl font-bold text-slate-900'>제출 완료</h2>
        <p className='mt-2 text-sm text-slate-500'>
          소중한 의견 감사합니다. 더 나은 교육을 위해 활용하겠습니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-6'>
      {/* 헤더 */}
      <header className='rounded-2xl border bg-white px-8 py-6 shadow-sm'>
        <h1 className='text-xl font-bold text-slate-900'>{surveyTitle}</h1>
        {studentName && (
          <p className='mt-2 text-sm text-slate-500'>
            <span className='font-medium text-slate-700'>{studentName}</span>님, 안녕하세요. 잠시 시간을 내어 응답해 주세요.
          </p>
        )}
        <p className='mt-2 text-xs text-slate-400'>
          응답 내용은 통계법 제33조에 의거 비밀이 보호되며 통계 목적에만 이용됩니다.
        </p>
      </header>

      {/* 섹션 */}
      {sections.map((section) => (
        <section key={section.no} className='rounded-2xl border bg-white shadow-sm'>
          {section.title && (
            <div className='border-b bg-slate-50 px-8 py-3'>
              <h2 className='text-sm font-bold text-slate-700'>
                <span className='text-blue-600'>{section.no}.</span> {section.title}
              </h2>
            </div>
          )}
          <div className='space-y-6 px-8 py-6'>
            {section.items.map((q) => {
              const visible = isQuestionVisible(q);
              if (!visible) return null;

              if (q.type === 'likert5') {
                const current = responses[q.id];
                return (
                  <div key={q.id}>
                    <label className='block text-sm font-medium text-slate-800'>
                      {q.text}
                      {q.required && <span className='ml-1 text-red-500'>*</span>}
                    </label>
                    <div className='mt-3 grid grid-cols-5 gap-1.5 sm:gap-2'>
                      {LIKERT5_LABELS.map((label, i) => {
                        const n = i + 1;
                        const selected = current === n;
                        return (
                          <button
                            key={n}
                            type='button'
                            onClick={() => setScale(q.id, n)}
                            className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 transition sm:gap-1 sm:px-2 sm:py-2 ${
                              selected
                                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                            }`}
                            style={{ wordBreak: 'keep-all' }}
                          >
                            <span className='text-sm font-bold tabular-nums sm:text-base'>{n}</span>
                            <span
                              className={`text-[10px] leading-[1.15] sm:text-[11px] ${
                                selected ? 'text-white/90' : 'text-slate-500'
                              }`}
                            >
                              {label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              if (q.type === 'text') {
                const isFollowUp = followUpMap.has(q.id);
                return (
                  <div key={q.id} className={isFollowUp ? 'rounded-lg bg-amber-50/40 p-4 ring-1 ring-amber-100' : ''}>
                    <label className='block text-sm font-medium text-slate-800'>
                      {isFollowUp && <span className='mr-1 text-amber-600'>↳</span>}
                      {q.text}
                      {q.required && <span className='ml-1 text-red-500'>*</span>}
                    </label>
                    <textarea
                      value={(responses[q.id] as string) ?? ''}
                      onChange={(e) => setText(q.id, e.target.value)}
                      rows={isFollowUp ? 2 : 3}
                      className='mt-2 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                      placeholder={isFollowUp ? '어떤 점이 아쉬우셨나요?' : '자유롭게 작성해 주세요'}
                    />
                  </div>
                );
              }

              return null;
            })}
          </div>
        </section>
      ))}

      {/* 에러 + 제출 */}
      {error && (
        <div className='rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>
          {error}
        </div>
      )}

      <div className='sticky bottom-4 z-10'>
        <button
          type='submit'
          disabled={pending}
          className='w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {pending ? '제출 중...' : '제출하기'}
        </button>
      </div>
    </form>
  );
}
