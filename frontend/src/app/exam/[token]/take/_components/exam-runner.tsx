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

  // 문항별 타이머
  const [remaining, setRemaining] = useState<number | null>(question.time_limit_seconds);
  const timeoutFiredRef = useRef(false);

  // 문항 전환 시 타이머 리셋
  useEffect(() => {
    timeoutFiredRef.current = false;
    setRemaining(question.time_limit_seconds);
  }, [question.id, question.time_limit_seconds]);

  // 카운트다운
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

  // 전체화면/창 이탈 이벤트 로깅 (fire-and-forget)
  // 이탈~복귀 시간을 짝지어 duration_ms 계산. 작업형(task_based)은 스킵.
  const isTask = question.type === 'task_based';
  const fsExitStartRef = useRef<number | null>(null);
  const visExitStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isTask) return;
    const onFs = () => {
      const now = Date.now();
      if (!document.fullscreenElement) {
        fsExitStartRef.current = now;
      } else if (fsExitStartRef.current != null) {
        const durationMs = now - fsExitStartRef.current;
        const at = new Date(fsExitStartRef.current).toISOString();
        fsExitStartRef.current = null;
        void logBrowserEvent({ token, event: 'fullscreen_exit', at, durationMs });
      }
    };
    const onVis = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        visExitStartRef.current = now;
      } else if (document.visibilityState === 'visible' && visExitStartRef.current != null) {
        const durationMs = now - visExitStartRef.current;
        const at = new Date(visExitStartRef.current).toISOString();
        visExitStartRef.current = null;
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

  const handleNext = async (timeoutReached = false) => {
    const payload = Object.keys(answer).length > 0 ? answer : null;
    // 서버는 fire-and-forget (전송만 하고 클라는 즉시 다음)
    // 실패 시 콘솔로만 표기, 사용자 흐름은 끊지 않음.
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

    // 다음 문항으로 즉시 전환
    setCurrentIdx((idx) => Math.min(totalCount - 1, idx + 1));
    // 저장 실패는 조용히 뒤에서 확인
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
    <div className='min-h-screen bg-slate-50 text-slate-900 flex flex-col'>
      <header className='sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur'>
        <div className='mx-auto max-w-4xl px-6 py-3 flex items-center justify-between gap-4'>
          <div>
            <div className='text-[10px] uppercase tracking-widest text-slate-400'>CBT</div>
            <div className='text-sm font-semibold text-slate-900 truncate max-w-[300px]'>
              {examName}
            </div>
          </div>
          <div className='flex items-center gap-6 text-xs'>
            <div className='text-slate-500'>
              응시자 <span className='text-slate-900 ml-1 font-medium'>{applicantName}</span>
            </div>
            <div className='text-slate-500'>
              진행{' '}
              <span className='text-slate-900 ml-1 font-medium'>
                {currentIdx + 1}/{totalCount}
              </span>
            </div>
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
        <div className='h-1 bg-slate-200'>
          <div
            className='h-full bg-blue-500 transition-all duration-300'
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <main className='flex-1 mx-auto max-w-4xl w-full px-6 py-10'>
        <div className='mb-6 flex items-center gap-2'>
          <span className='text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-white'>
            Q{question.order_no}
          </span>
          {question.category && (
            <span className='text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600'>
              {question.category}
            </span>
          )}
          {question.difficulty && (
            <span className='text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600'>
              난이도 {question.difficulty}
            </span>
          )}
          <span className='text-xs text-slate-400 ml-auto'>배점 {question.score}점</span>
        </div>

        <div className='mb-8 text-base leading-relaxed whitespace-pre-wrap text-slate-900'>
          {question.text}
        </div>

        {question.attachment_url && (
          <div className='mb-6'>
            <a
              href={question.attachment_url}
              target='_blank'
              rel='noopener noreferrer'
              className='text-xs text-blue-600 hover:underline'
            >
              첨부파일 열기 ↗
            </a>
          </div>
        )}

        {question.type === 'multiple_choice' && question.choices && (
          <div className='space-y-2'>
            {question.choices.map((c) => {
              const selected = (answer as { key?: string }).key === c.key;
              return (
                <button
                  key={c.key}
                  type='button'
                  onClick={() => setAnswerReplace({ key: c.key })}
                  className={`w-full text-left px-4 py-3 rounded-md border transition-all ${
                    selected
                      ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <span className='font-mono text-slate-400 mr-3'>{c.key}</span>
                  {c.text}
                </button>
              );
            })}
          </div>
        )}

        {question.type === 'short_text' && (
          <textarea
            value={(answer as { text?: string }).text ?? ''}
            onChange={(e) => setAnswerReplace({ text: e.target.value })}
            className='w-full min-h-[120px] rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none'
            placeholder='답변을 입력하세요'
          />
        )}

        {question.type === 'task_based' && (
          <div className='space-y-4 text-sm text-slate-600'>
            <p>작업형 문항입니다. 아래에 결과·URL·메모를 입력하세요.</p>
            <textarea
              value={(answer as { notes?: string }).notes ?? ''}
              onChange={(e) => setAnswerFor({ notes: e.target.value })}
              className='w-full min-h-[100px] rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none'
              placeholder='구현 메모·요약'
            />
            <input
              type='url'
              value={(answer as { url?: string }).url ?? ''}
              onChange={(e) => setAnswerFor({ url: e.target.value })}
              className='w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
              placeholder='제출 URL (npx 명령어·배포 URL 등)'
            />
            {question.allow_file_upload && (
              <p className='text-xs text-slate-400'>* 파일 업로드는 추후 지원 예정</p>
            )}
          </div>
        )}
      </main>

      <footer className='sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur'>
        <div className='mx-auto max-w-4xl px-6 py-4 flex items-center justify-between gap-4'>
          <div className='text-xs text-slate-400'>
            {isTask
              ? '작업형 문항 — 외부 앱 사용 가능 (전체화면 이탈 기록 안 됨)'
              : fullscreenRequired
                ? '전체화면 이탈 시 기록됩니다.'
                : ''}
          </div>
          <button
            type='button'
            onClick={() => void handleNext(false)}
            disabled={pending || !canSubmit}
            className='rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 transition-colors shadow-sm'
          >
            {pending ? '제출 중...' : isLast ? '최종 제출' : '다음 문항 →'}
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
