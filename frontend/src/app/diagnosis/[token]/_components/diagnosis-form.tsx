'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import { saveDiagnosisDraft, startDiagnosis } from '../_actions';

type Question = {
  id: string;
  question_no: number;
  type: string;
  text: string;
  choices: { key: string; text: string }[] | null;
};

type Props = {
  token: string;
  studentName: string;
  studentOrg: string;
  studentDepartment: string;
  diagnosisTitle: string;
  diagnosisType: string;
  durationMinutes: number;
  /** 서버 시각 기준 경과초. 아직 시작 전이면 null. 클라이언트 OS 시간 의존을 피하기 위해 서버에서 계산해 내려준다. */
  initialElapsedSeconds: number | null;
  questions: Question[];
};

type SubmitResult =
  | {
      ok: true;
      total_score: number;
      max_score: number;
      correct_count: number;
      alreadySubmitted?: boolean;
    }
  | { ok: false; error: string };

type Step = 'confirm' | 'test' | 'result';

const STORAGE_VERSION = 'v2';
const MAX_RETRIES = 3;

function storageKey(token: string) {
  return `diagnosis-draft-${STORAGE_VERSION}-${token}`;
}
function submitIdKey(token: string) {
  return `diagnosis-submit-id-${STORAGE_VERSION}-${token}`;
}
function reviewKey(token: string) {
  return `diagnosis-review-${STORAGE_VERSION}-${token}`;
}

function getOrCreateSubmitId(token: string): string {
  if (typeof window === 'undefined') return '';
  const k = submitIdKey(token);
  const cached = localStorage.getItem(k);
  if (cached) return cached;
  const id = crypto.randomUUID();
  localStorage.setItem(k, id);
  return id;
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function DiagnosisForm({
  token,
  studentName,
  studentOrg,
  studentDepartment,
  diagnosisTitle,
  diagnosisType,
  durationMinutes,
  initialElapsedSeconds,
  questions
}: Props) {
  const testDurationSeconds = durationMinutes * 60;

  // 서버에서 계산해 내려준 elapsed 기반으로 잔여시간 산출.
  // 클라이언트 Date.now() 절대 사용 금지 — 응시자 OS 시간이 어긋나도 영향 없게.
  const isStarted = initialElapsedSeconds != null;
  const initialRemain = isStarted
    ? Math.max(0, testDurationSeconds - initialElapsedSeconds)
    : testDurationSeconds;
  const isExpired = isStarted && initialRemain <= 0;

  const [step, setStep] = useState<Step>(
    isStarted && initialRemain > 0 ? 'test' : 'confirm'
  );
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(Math.max(0, initialRemain));
  const [startPending, startStartTransition] = useTransition();
  const autoSubmittedRef = useRef(false);

  // localStorage 에선 답안·리뷰 상태만 복구 (시작 시각은 서버 권위).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(token));
      if (raw) setAnswers(JSON.parse(raw) as Record<number, string>);
      const rev = localStorage.getItem(reviewKey(token));
      if (rev) setReviewed(new Set(JSON.parse(rev) as number[]));
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    if (Object.keys(answers).length === 0) return;
    try {
      localStorage.setItem(storageKey(token), JSON.stringify(answers));
    } catch {
      // ignore quota
    }
  }, [answers, token]);

  useEffect(() => {
    try {
      localStorage.setItem(reviewKey(token), JSON.stringify(Array.from(reviewed)));
    } catch {
      // ignore
    }
  }, [reviewed, token]);

  const setAnswer = (no: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [no]: value }));
  };

  const toggleReview = (no: number) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  };

  const unanswered = questions
    .filter((q) => !(answers[q.question_no] ?? '').trim())
    .map((q) => q.question_no);

  const submit = useCallback(
    async (auto: boolean) => {
      if (submitting || autoSubmittedRef.current) return;
      if (auto) autoSubmittedRef.current = true;
      setError(null);

      if (!auto && unanswered.length > 0) {
        const proceed = window.confirm(
          `${unanswered.length}개 문항이 비어 있습니다. 그대로 제출할까요?`
        );
        if (!proceed) {
          autoSubmittedRef.current = false;
          return;
        }
      }

      setSubmitting(true);
      const submitId = getOrCreateSubmitId(token);
      const supabase = createClient();

      let lastError = '';
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error: rpcError } = await (supabase.rpc as any)(
            'submit_diagnosis_response',
            { p_token: token, p_answers: answers, p_submit_id: submitId }
          );
          if (rpcError) {
            lastError = rpcError.message;
            if (attempt < MAX_RETRIES) {
              await new Promise((r) => setTimeout(r, 500 * attempt));
              continue;
            }
            break;
          }
          const res = data as {
            ok: boolean;
            error?: string;
            total_score?: number;
            max_score?: number;
            correct_count?: number;
            already_submitted?: boolean;
          };
          if (!res.ok) {
            lastError = res.error ?? 'unknown';
            break;
          }
          setResult({
            ok: true,
            total_score: Number(res.total_score ?? 0),
            max_score: Number(res.max_score ?? questions.length * 5),
            correct_count: Number(res.correct_count ?? 0),
            alreadySubmitted: res.already_submitted === true
          });
          try {
            localStorage.removeItem(storageKey(token));
            localStorage.removeItem(submitIdKey(token));
            localStorage.removeItem(reviewKey(token));
          } catch {
            // ignore
          }
          setStep('result');
          setSubmitting(false);
          return;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
      }

      setError(`제출에 실패했습니다. 잠시 후 다시 시도해주세요. (${lastError})`);
      setSubmitting(false);
      autoSubmittedRef.current = false;
    },
    [answers, questions.length, submitting, token, unanswered.length]
  );

  // 응답 카운트다운 (진단별 설정 시간)
  useEffect(() => {
    if (step !== 'test') return;
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          void submit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step, submit]);

  // 답안 중간 저장 (draft) — 최종 제출 실패·시간 초과 강제마감 시에도
  // 서버에 마지막 draft 가 남아 채점에 반영되도록 2초 debounce 로 동기화.
  useEffect(() => {
    if (step !== 'test') return;
    if (Object.keys(answers).length === 0) return;
    const id = setTimeout(() => {
      void saveDiagnosisDraft(token, answers).catch(() => {
        // 다음 debounce 에서 재시도되므로 무시
      });
    }, 2000);
    return () => clearTimeout(id);
  }, [answers, step, token]);

  // 탭 복귀 시 서버 시각으로 타이머 재동기화.
  // 모바일 화면 잠금·백그라운드에서 setInterval 이 멈춰 클라이언트 잔여시간이
  // 실제보다 많게 보이는 문제 대응 — 서버 기준 만료면 즉시 자동 제출.
  useEffect(() => {
    if (step !== 'test') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        const r = await startDiagnosis(token);
        if (!r.ok) {
          if (r.error === 'already_submitted') void submit(true);
          return;
        }
        const remain = Math.max(0, testDurationSeconds - r.elapsedSeconds);
        setTimeLeft(remain);
        if (remain <= 0) void submit(true);
      })();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [step, submit, testDurationSeconds, token]);

  // === 본인 확인 단계 ===
  if (step === 'confirm') {
    return (
      <div className='rounded-2xl border bg-white px-8 py-10 text-center shadow-lg'>
        <div className='mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400'>
          {diagnosisType === 'pre' ? '사전 평가' : '사후 평가'}
        </div>
        <h1 className='mb-8 text-lg font-bold text-slate-900'>{diagnosisTitle}</h1>

        <div className='mx-auto max-w-xs rounded-2xl bg-blue-50 px-6 py-6'>
          <div className='text-2xl font-bold text-slate-900'>{studentName}</div>
          {studentOrg && <div className='mt-1 text-sm text-slate-600'>{studentOrg}</div>}
          {studentDepartment && (
            <div className='mt-0.5 text-xs text-slate-500'>{studentDepartment}</div>
          )}
        </div>
        {isExpired ? (
          <>
            <p className='mt-6 text-sm font-semibold text-rose-600'>
              응답 가능 시간이 종료되었습니다.
            </p>
            <p className='mt-1 text-xs text-slate-500'>
              제한 시간({durationMinutes}분)이 이미 지나 더 이상 응답할 수 없습니다.
              운영자에게 문의해주세요.
            </p>
            <div className='mt-8'>
              <button
                type='button'
                disabled
                className='w-full rounded-xl bg-slate-200 px-4 py-3 font-semibold text-slate-500'
              >
                시간 초과 (시작 불가)
              </button>
            </div>
          </>
        ) : (
          <>
            <p className='mt-6 text-sm text-slate-700'>본인이 맞으십니까?</p>
            <p className='mt-1 text-xs text-slate-500'>
              확인 후 <strong>{durationMinutes}분간 {questions.length}문항</strong>에 응답합니다. 시간 만료 시 자동 제출됩니다.
            </p>

            <div className='mt-8 flex gap-3'>
              <button
                type='button'
                onClick={() => window.history.back()}
                disabled={startPending}
                className='flex-1 rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
              >
                아니오
              </button>
              <button
                type='button'
                disabled={startPending}
                onClick={() => {
                  startStartTransition(async () => {
                    const r = await startDiagnosis(token);
                    if (!r.ok) {
                      setError(
                        r.error === 'already_submitted'
                          ? '이미 제출된 응답입니다.'
                          : '시작 요청에 실패했습니다. 잠시 후 다시 시도해주세요.'
                      );
                      return;
                    }
                    const remain = Math.max(0, testDurationSeconds - r.elapsedSeconds);
                    if (remain <= 0) {
                      // 서버 시각 기준 이미 만료 — 시작 안 함.
                      setError(
                        '응답 가능 시간이 종료되었습니다. 운영자에게 문의해주세요.'
                      );
                      return;
                    }
                    setTimeLeft(remain);
                    setStep('test');
                  });
                }}
                className='flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60'
              >
                {startPending ? '시작 중...' : '예, 시작'}
              </button>
            </div>
            {error && (
              <p className='mt-3 text-xs font-semibold text-rose-600'>{error}</p>
            )}
          </>
        )}
      </div>
    );
  }

  // === 결과 (학생에게는 점수 비공개) ===
  if (step === 'result' && result?.ok) {
    return (
      <div className='rounded-2xl border bg-white px-8 py-12 text-center shadow-lg'>
        <div className='mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400'>
          {studentName} · {diagnosisType === 'pre' ? '사전' : '사후'}
        </div>
        <h2 className='text-xl font-bold text-slate-900'>제출 완료</h2>
        {result.alreadySubmitted ? (
          <>
            <p className='mt-2 text-sm font-semibold text-amber-600'>
              제한 시간이 지나 이미 마감 처리된 응답입니다.
            </p>
            <p className='mt-1 text-xs text-slate-400'>
              마감 시점까지 저장된 답안이 접수되었습니다.
            </p>
          </>
        ) : (
          <>
            <p className='mt-2 text-sm text-slate-500'>
              응답해주셔서 감사합니다.
            </p>
            <p className='mt-1 text-xs text-slate-400'>
              {questions.length}문항 모두 정상 접수되었습니다.
            </p>
          </>
        )}
      </div>
    );
  }

  // === 시험 (문제당 1페이지 + 검토 + 우측 네비) ===
  const lowTime = timeLeft <= 60;
  const current = questions[currentIndex];
  const currentNo = current.question_no;
  const isAnswered = (no: number) => !!(answers[no] ?? '').trim();
  const isReviewed = (no: number) => reviewed.has(no);
  const answeredCount = questions.filter((q) => isAnswered(q.question_no)).length;
  const reviewedCount = reviewed.size;
  const isLast = currentIndex === questions.length - 1;
  const isFirst = currentIndex === 0;

  const navPanel = (
    <div className='rounded-2xl border bg-white p-4 shadow-lg backdrop-blur'>
      <div className='mb-3 flex items-center justify-between text-xs font-semibold text-slate-600'>
        <span>문항 목록</span>
        <span className='text-slate-400'>
          {answeredCount}/{questions.length}
        </span>
      </div>
      <div className='grid grid-cols-5 gap-2'>
        {questions.map((q, idx) => {
          const ans = isAnswered(q.question_no);
          const rev = isReviewed(q.question_no);
          const isCurrent = idx === currentIndex;
          return (
            <button
              key={q.id}
              type='button'
              onClick={() => setCurrentIndex(idx)}
              className={`relative aspect-square rounded-lg border text-sm font-bold transition-all ${
                isCurrent
                  ? 'border-blue-700 bg-blue-700 text-white shadow-md'
                  : ans
                    ? 'border-blue-300 bg-blue-100 text-blue-800 hover:border-blue-500'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
              }`}
            >
              {q.question_no}
              {rev && (
                <span className='absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] text-white shadow'>
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className='mt-4 space-y-1.5 border-t pt-3 text-[11px] text-slate-500'>
        <div className='flex items-center gap-2'>
          <span className='inline-block h-3 w-3 rounded border border-blue-300 bg-blue-100' />
          답함 ({answeredCount})
        </div>
        <div className='flex items-center gap-2'>
          <span className='inline-block h-3 w-3 rounded border border-slate-200 bg-white' />
          미응답 ({questions.length - answeredCount})
        </div>
        <div className='flex items-center gap-2'>
          <span className='inline-flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[7px] text-white'>
            !
          </span>
          나중에 풀기 ({reviewedCount})
        </div>
      </div>

      <button
        type='button'
        onClick={() => submit(false)}
        disabled={submitting}
        className='mt-4 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2.5 text-xs font-semibold text-white hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
      >
        {submitting ? '제출 중...' : '최종 제출'}
      </button>
    </div>
  );

  return (
    <div
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className='select-none'
    >
      {/* 상단 타이머 + 진행도 — 문항과 같은 폭 */}
      <div className='sticky top-0 z-20 -mx-4 border-b bg-white/95 px-4 py-3 backdrop-blur'>
        <div className='mx-auto flex max-w-3xl items-center justify-between'>
          <div className='min-w-0'>
            <div className='text-xs font-semibold uppercase tracking-wider text-slate-400'>
              {studentName} · {diagnosisType === 'pre' ? '사전' : '사후'}
            </div>
            <div className='truncate text-sm font-semibold text-slate-900'>
              {diagnosisTitle}
            </div>
          </div>
          <motion.div
            animate={lowTime ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.8, repeat: lowTime ? Infinity : 0 }}
            className={`rounded-xl px-4 py-2 font-mono text-2xl font-bold tabular-nums ${
              lowTime ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}
          >
            {formatTime(timeLeft)}
          </motion.div>
        </div>
      </div>

      {/* 문항 — 헤더와 동일 폭으로 가운데 정렬 */}
      <div className='mx-auto mt-4 max-w-3xl'>
        <div className='flex min-h-[560px] w-full flex-col gap-4'>
          <AnimatePresence mode='wait'>
            <motion.div
              key={currentNo}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
              className='flex-1 rounded-2xl border bg-white p-6 shadow-sm'
            >
              <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <span className='inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700'>
                    {currentNo}
                  </span>
                  <span className='text-xs text-slate-500'>
                    {currentIndex + 1} / {questions.length}
                  </span>
                </div>
                <label className='flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100'>
                  <input
                    type='checkbox'
                    checked={isReviewed(currentNo)}
                    onChange={() => toggleReview(currentNo)}
                    className='h-4 w-4 accent-amber-500'
                  />
                  나중에 풀기
                </label>
              </div>

              <p className='text-base leading-relaxed text-slate-900 sm:text-lg'>{current.text}</p>

              {current.type === 'multiple_choice' && current.choices && (
                <div className='mt-5 space-y-2'>
                  {current.choices.map((c) => (
                    <label
                      key={c.key}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-all ${
                        answers[currentNo] === c.key
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <input
                        type='radio'
                        name={`q-${currentNo}`}
                        value={c.key}
                        checked={answers[currentNo] === c.key}
                        onChange={(e) => setAnswer(currentNo, e.target.value)}
                        className='mt-0.5 h-4 w-4'
                      />
                      <span className='text-base leading-relaxed text-slate-800'>
                        <span className='mr-1 font-semibold'>{c.key}</span>
                        {c.text}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {current.type === 'ox' && (
                <div className='mt-5 grid grid-cols-2 gap-3'>
                  {['O', 'X'].map((k) => (
                    <label
                      key={k}
                      className={`flex cursor-pointer items-center justify-center rounded-xl border-2 px-4 py-6 text-3xl font-bold transition-all ${
                        answers[currentNo] === k
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type='radio'
                        name={`q-${currentNo}`}
                        value={k}
                        checked={answers[currentNo] === k}
                        onChange={(e) => setAnswer(currentNo, e.target.value)}
                        className='sr-only'
                      />
                      {k}
                    </label>
                  ))}
                </div>
              )}

              {current.type === 'short_text' && (
                <input
                  type='text'
                  value={answers[currentNo] ?? ''}
                  onChange={(e) => setAnswer(currentNo, e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  onDrop={(e) => e.preventDefault()}
                  autoComplete='off'
                  autoCorrect='off'
                  spellCheck={false}
                  placeholder='답안을 직접 입력하세요 (붙여넣기 불가)'
                  className='mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* 좌측 이전/다음 버튼 */}
          <div className='flex gap-3'>
            <button
              type='button'
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={isFirst}
              className='flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
            >
              ← 이전
            </button>
            {isLast ? (
              <button
                type='button'
                onClick={() => submit(false)}
                disabled={submitting}
                className='flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {submitting ? '제출 중...' : `제출 (${answeredCount}/${questions.length})`}
              </button>
            ) : (
              <button
                type='button'
                onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                className='flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700'
              >
                다음 →
              </button>
            )}
          </div>

          {error && (
            <div className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
              {error}
            </div>
          )}
        </div>

      </div>

      {/* 데스크탑: 문항 우측 빈 공간에 떠 있음 — viewport 가운데 + 문항 폭(max-w-3xl) 절반 + gap */}
      <aside
        className='fixed top-24 hidden w-[220px] xl:block'
        style={{ left: 'calc(50% + 24rem + 1.5rem)' }}
      >
        {navPanel}
      </aside>

      {/* 모바일·태블릿: 문항 아래 inline */}
      <aside className='mx-auto mt-4 max-w-3xl xl:hidden'>{navPanel}</aside>
    </div>
  );
}
