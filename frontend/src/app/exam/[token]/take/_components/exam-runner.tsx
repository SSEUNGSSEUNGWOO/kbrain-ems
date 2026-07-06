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
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) {
        void logBrowserEvent({ token, event: 'fullscreen_exit', at: new Date().toISOString() });
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        void logBrowserEvent({ token, event: 'visibility_hidden', at: new Date().toISOString() });
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token]);

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
    <div className='min-h-screen bg-neutral-950 text-neutral-100 flex flex-col'>
      <header className='sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur'>
        <div className='mx-auto max-w-4xl px-6 py-3 flex items-center justify-between gap-4'>
          <div>
            <div className='text-[10px] uppercase tracking-widest text-neutral-500'>CBT</div>
            <div className='text-sm font-semibold text-neutral-100 truncate max-w-[300px]'>
              {examName}
            </div>
          </div>
          <div className='flex items-center gap-6 text-xs'>
            <div className='text-neutral-400'>
              응시자 <span className='text-neutral-100 ml-1 font-medium'>{applicantName}</span>
            </div>
            <div className='text-neutral-400'>
              진행{' '}
              <span className='text-neutral-100 ml-1 font-medium'>
                {currentIdx + 1}/{totalCount}
              </span>
            </div>
            {remaining !== null && (
              <div
                className={`px-2 py-1 rounded font-mono text-sm ${
                  remaining <= 10
                    ? 'bg-rose-950/60 text-rose-300 animate-pulse'
                    : 'bg-neutral-800 text-neutral-100'
                }`}
              >
                {formatSec(remaining)}
              </div>
            )}
          </div>
        </div>
        <div className='h-1 bg-neutral-900'>
          <div
            className='h-full bg-emerald-500 transition-all duration-300'
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <main className='flex-1 mx-auto max-w-4xl w-full px-6 py-10'>
        <div className='mb-6 flex items-center gap-2'>
          <span className='text-xs font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300'>
            Q{question.order_no}
          </span>
          {question.category && (
            <span className='text-xs px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400'>
              {question.category}
            </span>
          )}
          {question.difficulty && (
            <span className='text-xs px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400'>
              난이도 {question.difficulty}
            </span>
          )}
          <span className='text-xs text-neutral-500 ml-auto'>배점 {question.score}점</span>
        </div>

        <div className='mb-8 text-base leading-relaxed whitespace-pre-wrap text-neutral-100'>
          {question.text}
        </div>

        {question.attachment_url && (
          <div className='mb-6'>
            <a
              href={question.attachment_url}
              target='_blank'
              rel='noopener noreferrer'
              className='text-xs text-blue-400 hover:underline'
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
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-100'
                      : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-900/80 text-neutral-200'
                  }`}
                >
                  <span className='font-mono text-neutral-500 mr-3'>{c.key}</span>
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
            className='w-full min-h-[120px] rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3 text-neutral-100 focus:border-emerald-500 focus:outline-none resize-none'
            placeholder='답변을 입력하세요'
          />
        )}

        {question.type === 'task_based' && (
          <div className='space-y-4 text-sm text-neutral-400'>
            <p>작업형 문항입니다. 아래에 결과·URL·메모를 입력하세요.</p>
            <textarea
              value={(answer as { notes?: string }).notes ?? ''}
              onChange={(e) => setAnswerFor({ notes: e.target.value })}
              className='w-full min-h-[100px] rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3 text-neutral-100 focus:border-emerald-500 focus:outline-none resize-none'
              placeholder='구현 메모·요약'
            />
            <input
              type='url'
              value={(answer as { url?: string }).url ?? ''}
              onChange={(e) => setAnswerFor({ url: e.target.value })}
              className='w-full rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none'
              placeholder='제출 URL (npx 명령어·배포 URL 등)'
            />
            {question.allow_file_upload && (
              <p className='text-xs text-neutral-500'>* 파일 업로드는 추후 지원 예정</p>
            )}
          </div>
        )}
      </main>

      <footer className='sticky bottom-0 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur'>
        <div className='mx-auto max-w-4xl px-6 py-4 flex items-center justify-between gap-4'>
          <div className='text-xs text-neutral-500'>
            {fullscreenRequired ? '전체화면 이탈 시 기록됩니다.' : ''}
          </div>
          <button
            type='button'
            onClick={() => void handleNext(false)}
            disabled={pending || !canSubmit}
            className='rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-950 font-semibold px-6 py-2.5 transition-colors'
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
