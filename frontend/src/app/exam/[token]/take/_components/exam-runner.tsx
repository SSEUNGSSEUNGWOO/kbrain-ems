'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveAnswer, logBrowserEvent, submitSession } from '../../_actions';

export type QuestionForRunner = {
  order_no: number;
  id: string;
  type: 'multiple_choice' | 'short_text' | 'task_based';
  text: string;
  score: number;
  choices: { key: string; text: string }[] | null;
  time_limit_seconds: number | null;
  allow_file_upload: boolean;
  attachment_url: string | null;
  category: string | null;
  difficulty: string | null;
};

type Props = {
  token: string;
  examName: string;
  applicantName: string;
  fullscreenRequired: boolean;
  startOrder: number;
  questions: QuestionForRunner[];
  savedAnswers: Record<string, Record<string, unknown>>;
};

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: '객관식',
  short_text: '단답형',
  task_based: '작업형'
};
const TYPE_TONE: Record<string, string> = {
  multiple_choice: 'bg-blue-100 text-blue-800 border-blue-200',
  short_text: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  task_based: 'bg-amber-100 text-amber-800 border-amber-200'
};

export function ExamRunner(props: Props) {
  const { token, examName, applicantName, fullscreenRequired, startOrder, questions, savedAnswers } = props;
  const router = useRouter();
  const totalCount = questions.length;

  const [currentIdx, setCurrentIdx] = useState(() =>
    Math.max(0, Math.min(totalCount - 1, startOrder - 1))
  );
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>(savedAnswers);
  const [pending, startTransition] = useTransition();

  const question = questions[currentIdx];
  const answer = answers[question.id] ?? {};
  const isLast = currentIdx === totalCount - 1;

  const [remaining, setRemaining] = useState<number | null>(question.time_limit_seconds);
  const timeoutFiredRef = useRef(false);

  useEffect(() => {
    timeoutFiredRef.current = false;
    setRemaining(question.time_limit_seconds);
  }, [question.id, question.time_limit_seconds]);

  useEffect(() => {
    if (remaining == null) return;
    if (remaining <= 0) {
      if (!timeoutFiredRef.current) {
        timeoutFiredRef.current = true;
        void handleNext(true);
      }
      return;
    }
    const id = setTimeout(() => setRemaining((v) => (v == null ? null : v - 1)), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const isTask = question.type === 'task_based';
  const fsExitStartRef = useRef<number | null>(null);
  const visExitStartRef = useRef<number | null>(null);
  const [exitCount, setExitCount] = useState(0);
  const [exitTotalMs, setExitTotalMs] = useState(0);
  const [inExit, setInExit] = useState(false);
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);

  // 이탈 중일 때 라이브 카운터 (1초 간격)
  useEffect(() => {
    if (!inExit) return;
    const id = setInterval(() => {
      if (fsExitStartRef.current != null) {
        setLiveElapsedMs(Date.now() - fsExitStartRef.current);
      } else if (visExitStartRef.current != null) {
        setLiveElapsedMs(Date.now() - visExitStartRef.current);
      }
    }, 500);
    return () => clearInterval(id);
  }, [inExit]);

  useEffect(() => {
    if (isTask) return;
    const onFs = () => {
      const now = Date.now();
      if (!document.fullscreenElement) {
        fsExitStartRef.current = now;
        setInExit(true);
        setLiveElapsedMs(0);
      } else if (fsExitStartRef.current != null) {
        const durationMs = now - fsExitStartRef.current;
        const at = new Date(fsExitStartRef.current).toISOString();
        fsExitStartRef.current = null;
        setInExit(false);
        setExitCount((n) => n + 1);
        setExitTotalMs((v) => v + durationMs);
        void logBrowserEvent({ token, event: 'fullscreen_exit', at, durationMs });
      }
    };
    const onVis = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        visExitStartRef.current = now;
        setInExit(true);
        setLiveElapsedMs(0);
      } else if (document.visibilityState === 'visible' && visExitStartRef.current != null) {
        const durationMs = now - visExitStartRef.current;
        const at = new Date(visExitStartRef.current).toISOString();
        visExitStartRef.current = null;
        setInExit(false);
        setExitCount((n) => n + 1);
        setExitTotalMs((v) => v + durationMs);
        void logBrowserEvent({ token, event: 'visibility_hidden', at, durationMs });
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token, isTask]);

  const requestReenterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* ignore */
    }
  };

  const handleNext = async (timeoutReached = false) => {
    const payload = Object.keys(answer).length > 0 ? answer : null;
    const savePromise = saveAnswer({
      token,
      currentOrder: question.order_no,
      questionId: question.id,
      answer: payload as never,
      timeoutReached,
      isLast
    });

    if (isLast) {
      startTransition(async () => {
        const res = await savePromise;
        if (res.error) alert(res.error);
        await submitSession(token);
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
        router.push(`/exam/${token}/done`);
      });
      return;
    }

    setCurrentIdx((idx) => Math.min(totalCount - 1, idx + 1));
    void savePromise.then((res) => {
      if (res.error) console.warn('save error:', res.error);
    });
  };

  const setAnswerFor = (patch: Record<string, unknown>) => {
    setAnswers((prev) => ({ ...prev, [question.id]: { ...(prev[question.id] ?? {}), ...patch } }));
  };
  const setAnswerReplace = (next: Record<string, unknown>) => {
    setAnswers((prev) => ({ ...prev, [question.id]: next }));
  };

  const canSubmit = question.type === 'task_based' ? true : Object.keys(answer).length > 0;
  const progressPct = useMemo(() => ((currentIdx + 1) / totalCount) * 100, [currentIdx, totalCount]);

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900 flex flex-col'>
      {/* 이탈 감지 시 전체 오버레이 경고 */}
      {inExit && !isTask && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-rose-950/80 backdrop-blur-sm p-6'>
          <div className='max-w-md w-full rounded-2xl bg-white p-8 shadow-2xl text-center border-4 border-rose-500'>
            <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100'>
              <svg
                className='h-9 w-9 text-rose-600'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth='2.5'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z'
                />
              </svg>
            </div>
            <h2 className='text-xl font-bold text-slate-900 mb-2'>전체화면 이탈 감지</h2>
            <p className='text-sm text-slate-600 mb-1'>
              시험 중 화면 이탈이 기록됩니다. 즉시 전체화면으로 돌아가세요.
            </p>
            <div className='my-5 py-3 rounded-lg bg-rose-50 border border-rose-200'>
              <div className='text-[10px] uppercase tracking-widest text-rose-500 mb-1'>
                현재 이탈 시간
              </div>
              <div className='font-mono text-3xl font-bold text-rose-700 tabular-nums'>
                {formatSecFromMs(liveElapsedMs)}
              </div>
              <div className='mt-1 text-[11px] text-rose-600'>
                누적: {exitCount}회 · {formatSecFromMs(exitTotalMs)}
              </div>
            </div>
            <button
              type='button'
              onClick={() => void requestReenterFullscreen()}
              className='w-full rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold px-6 py-3 shadow-sm'
            >
              전체화면으로 복귀
            </button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <header className='sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-md'>
        <div className='mx-auto max-w-4xl px-6 py-3 flex items-center justify-between gap-4'>
          <div className='flex items-center gap-3 min-w-0'>
            <div className='h-8 w-8 rounded-md bg-slate-900 text-white flex items-center justify-center text-[11px] font-bold tracking-tighter flex-shrink-0'>
              KB
            </div>
            <div className='min-w-0'>
              <div className='text-[10px] uppercase tracking-widest text-slate-400'>CBT</div>
              <div className='text-sm font-semibold text-slate-900 truncate'>{examName}</div>
            </div>
          </div>
          <div className='flex items-center gap-5 flex-shrink-0'>
            <div className='hidden sm:block text-xs text-right'>
              <div className='text-[10px] uppercase tracking-widest text-slate-400'>응시자</div>
              <div className='font-semibold text-slate-900'>{applicantName}</div>
            </div>
            <div className='text-xs text-right'>
              <div className='text-[10px] uppercase tracking-widest text-slate-400'>진행</div>
              <div className='font-semibold text-slate-900 tabular-nums'>
                {currentIdx + 1} <span className='text-slate-400'>/ {totalCount}</span>
              </div>
            </div>
            {!isTask && exitCount > 0 && (
              <div className='text-xs text-right'>
                <div className='text-[10px] uppercase tracking-widest text-slate-400'>이탈</div>
                <div className='font-semibold text-amber-700 tabular-nums'>
                  {exitCount}회 <span className='text-slate-400'>· {formatSecFromMs(exitTotalMs)}</span>
                </div>
              </div>
            )}
            {remaining !== null && (
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-2xl font-bold tabular-nums border-2 shadow-sm transition-colors ${
                  remaining <= 5
                    ? 'bg-rose-100 text-rose-700 border-rose-400 animate-pulse'
                    : remaining <= 15
                      ? 'bg-amber-100 text-amber-800 border-amber-400'
                      : 'bg-blue-50 text-blue-700 border-blue-300'
                }`}
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='h-5 w-5'
                  aria-hidden='true'
                >
                  <circle cx='12' cy='12' r='10' />
                  <polyline points='12 6 12 12 16 14' />
                </svg>
                {formatSec(remaining)}
              </div>
            )}
          </div>
        </div>
        <div className='h-1 bg-slate-100'>
          <div
            className='h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300'
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* 문제 카드 */}
      <main className='flex-1 mx-auto max-w-4xl w-full px-6 py-8'>
        <div className='rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden'>
          <div className='px-8 py-5 border-b border-slate-100 bg-slate-50/40 flex items-center gap-3 flex-wrap'>
            <span className='inline-flex items-center justify-center h-8 min-w-[3rem] px-2.5 rounded-md bg-slate-900 text-white text-sm font-bold tabular-nums'>
              Q{question.order_no}
            </span>
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TYPE_TONE[question.type]}`}
            >
              {TYPE_LABEL[question.type]}
            </span>
            {question.category && (
              <span className='inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600'>
                {question.category}
              </span>
            )}
            <span className='ml-auto text-[11px] text-slate-500'>
              배점 <span className='font-semibold text-slate-900'>{question.score}점</span>
            </span>
          </div>

          <div className='px-8 pt-6 pb-4'>
            <div className='text-[15px] leading-8 whitespace-pre-wrap text-slate-800'>
              {question.text}
            </div>
            {question.attachment_url && (
              <a
                href={question.attachment_url}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 mt-4 text-xs text-blue-600 hover:underline'
              >
                📎 첨부파일 열기
              </a>
            )}
          </div>

          <div className='px-8 pt-2 pb-8'>
            {question.type === 'multiple_choice' && question.choices && (
              <div className='space-y-2.5'>
                {question.choices.map((c) => {
                  const selected = (answer as { key?: string }).key === c.key;
                  return (
                    <button
                      key={c.key}
                      type='button'
                      onClick={() => setAnswerReplace({ key: c.key })}
                      className={`group w-full text-left px-5 py-4 rounded-xl border-2 transition-all ${
                        selected
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                      }`}
                    >
                      <div className='flex items-start gap-4'>
                        <span
                          className={`flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-full font-mono text-xs font-bold ${
                            selected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700'
                          }`}
                        >
                          {c.key}
                        </span>
                        <span
                          className={`flex-1 leading-relaxed text-[15px] ${selected ? 'text-blue-950 font-medium' : 'text-slate-700'}`}
                        >
                          {c.text}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {question.type === 'short_text' && (
              <textarea
                value={(answer as { text?: string }).text ?? ''}
                onChange={(e) => setAnswerReplace({ text: e.target.value })}
                className='w-full min-h-[140px] rounded-xl border-2 border-slate-200 bg-white px-5 py-4 text-[15px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none transition-all'
                placeholder='답변을 입력하세요'
              />
            )}

            {question.type === 'task_based' && (
              <div className='space-y-4'>
                <div className='rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900'>
                  💡 작업형 문항입니다. 결과 URL과 구현 메모를 입력하세요. 외부 앱 사용 가능합니다.
                </div>
                <div>
                  <label className='block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5'>
                    구현 메모·요약
                  </label>
                  <textarea
                    value={(answer as { notes?: string }).notes ?? ''}
                    onChange={(e) => setAnswerFor({ notes: e.target.value })}
                    className='w-full min-h-[120px] rounded-xl border-2 border-slate-200 bg-white px-5 py-4 text-[15px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none transition-all'
                    placeholder='구현 방법·사용 도구·주요 코드 요약 (3~5줄)'
                  />
                </div>
                <div>
                  <label className='block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5'>
                    제출 URL (npm/GitHub)
                  </label>
                  <input
                    type='url'
                    value={(answer as { url?: string }).url ?? ''}
                    onChange={(e) => setAnswerFor({ url: e.target.value })}
                    className='w-full rounded-xl border-2 border-slate-200 bg-white px-5 py-3 text-[15px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all'
                    placeholder='https://github.com/... 또는 npm 패키지 URL'
                  />
                </div>
                {question.allow_file_upload && (
                  <p className='text-xs text-slate-400'>* 파일 업로드는 추후 지원 예정</p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 하단 */}
      <footer className='sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur-md'>
        <div className='mx-auto max-w-4xl px-6 py-4 flex items-center justify-between gap-4'>
          <div className='text-xs text-slate-400'>
            {isTask
              ? '작업형 문항 — 외부 앱 사용 가능 (전체화면 이탈 기록 안 됨)'
              : fullscreenRequired
                ? '전체화면 이탈 시 이탈 시간이 기록됩니다.'
                : ''}
          </div>
          <button
            type='button'
            onClick={() => void handleNext(false)}
            disabled={pending || !canSubmit}
            className={`inline-flex items-center gap-2 rounded-xl font-semibold px-6 py-3 shadow-sm transition-all ${
              isLast
                ? 'bg-blue-700 hover:bg-blue-600 text-white shadow-blue-200'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {pending ? '저장 중...' : isLast ? '최종 제출' : '다음 문항'}
            {!pending && (
              <svg
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 20 20'
                fill='currentColor'
                className='h-4 w-4'
              >
                <path
                  fillRule='evenodd'
                  d='M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z'
                  clipRule='evenodd'
                />
              </svg>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatSecFromMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs === 0 ? `${m}분` : `${m}분 ${rs}초`;
}
