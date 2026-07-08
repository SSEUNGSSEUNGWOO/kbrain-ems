'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveAnswer, logBrowserEvent, submitSection, submitSession, toggleFlag } from '../../_actions';
import { QuestionText } from './question-text';
import { TaskFileUpload, type UploadedFile } from './task-file-upload';

export type SectionKind = 'multiple_choice' | 'short_text' | 'task_based';

export type QuestionForRunner = {
  order_no: number;
  id: string;
  code: string;
  type: SectionKind;
  text: string;
  score: number;
  choices: { key: string; text: string }[] | null;
  allow_file_upload: boolean;
  attachment_url: string | null;
  category: string | null;
};

// 문항 코드별 제출 체크리스트 (작업형 UI 상단 안내)
// 코드가 매핑에 없으면 기본 안내 사용.
const SUBMISSION_HINTS: Record<string, string[]> = {
  // 실전 1기·2기 — 로컬 Ollama 도구 구축
  'T-E-036': [
    '코드 파일 (app.py · index.html)',
    '질문 1·2 각각의 응답 화면 캡처 2장',
    '실행 명령 · Ollama 모델명 · 파일 목록 메모'
  ],
  // 테스트 CBT — HTML 대시보드
  'PRACT-TB-001': [
    'HTML/CSS/JS 대시보드 파일 (index.html 등)',
    '샘플 CSV 파일 (동작 확인용)',
    '핵심 화면 캡처 1~2장',
    '계산 기준·사용 방법 메모'
  ]
};

const SECTION_LABEL: Record<SectionKind, string> = {
  multiple_choice: '객관식',
  short_text: '단답형',
  task_based: '작업형'
};
const SECTION_TONE: Record<SectionKind, string> = {
  multiple_choice: 'bg-blue-100 text-blue-800 border-blue-300',
  short_text: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  task_based: 'bg-amber-100 text-amber-800 border-amber-300'
};

const SECTION_ORDER: SectionKind[] = ['multiple_choice', 'short_text', 'task_based'];

type Props = {
  token: string;
  examName: string;
  applicantName: string;
  fullscreenRequired: boolean;
  questions: QuestionForRunner[];
  savedAnswers: Record<string, Record<string, unknown>>;
  flaggedIds: string[];
  currentSection: SectionKind;
  currentSectionStartedAt: string;
  sectionLimits: Record<SectionKind, number>;
};

export function ExamRunner(props: Props) {
  const {
    token,
    examName,
    applicantName,
    fullscreenRequired,
    questions,
    savedAnswers,
    flaggedIds,
    currentSection,
    currentSectionStartedAt,
    sectionLimits
  } = props;

  const router = useRouter();
  const isTask = currentSection === 'task_based';

  // 섹션별 문항 필터
  const sectionQuestions = useMemo(
    () => questions.filter((q) => q.type === currentSection),
    [questions, currentSection]
  );

  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>(savedAnswers);
  const [flagged, setFlagged] = useState<Set<string>>(new Set(flaggedIds));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pending, startTransition] = useTransition();

  const question = sectionQuestions[currentIdx];
  const answer = question ? answers[question.id] ?? {} : {};

  // 섹션 타이머 (서버 시각 기준)
  const sectionLimit = sectionLimits[currentSection];
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - new Date(currentSectionStartedAt).getTime()) / 1000);
    return Math.max(0, sectionLimit - elapsed);
  });

  const timeoutFiredRef = useRef(false);

  useEffect(() => {
    // 섹션 변경 시 리셋
    timeoutFiredRef.current = false;
    const elapsed = Math.floor((Date.now() - new Date(currentSectionStartedAt).getTime()) / 1000);
    setRemaining(Math.max(0, sectionLimit - elapsed));
    setCurrentIdx(0);
  }, [currentSection, currentSectionStartedAt, sectionLimit]);

  useEffect(() => {
    if (remaining <= 0) {
      if (!timeoutFiredRef.current) {
        timeoutFiredRef.current = true;
        void handleAdvanceSection(true);
      }
      return;
    }
    const id = setTimeout(() => setRemaining((v) => v - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  // 이탈 감지 (작업형은 스킵)
  // 두 이탈 상태(fullscreen 벗어남 / 탭 hidden)를 별도로 관리해야 함.
  // 하나로 합치면 탭이 다시 보이는 순간 fullscreen이 아직 해제된 상태여도 오버레이가 사라지는 버그.
  const fsExitStartRef = useRef<number | null>(null);
  const visExitStartRef = useRef<number | null>(null);
  const [exitCount, setExitCount] = useState(0);
  const [exitTotalMs, setExitTotalMs] = useState(0);
  const [fsExited, setFsExited] = useState(false);
  const [visHidden, setVisHidden] = useState(false);
  const inExit = fsExited || visHidden;
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);
  const [duplicateTab, setDuplicateTab] = useState(false);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(`exam-${token}`);
    bc.postMessage({ type: 'hello' });
    bc.onmessage = (ev: MessageEvent) => {
      const t = (ev.data as { type?: string })?.type;
      if (t === 'hello' || t === 'here') {
        setDuplicateTab(true);
        if (t === 'hello') bc.postMessage({ type: 'here' });
      }
    };
    return () => bc.close();
  }, [token]);

  useEffect(() => {
    if (!inExit) return;
    const id = setInterval(() => {
      if (fsExitStartRef.current != null) setLiveElapsedMs(Date.now() - fsExitStartRef.current);
      else if (visExitStartRef.current != null) setLiveElapsedMs(Date.now() - visExitStartRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [inExit]);

  useEffect(() => {
    if (isTask) return;
    const onFs = () => {
      const now = Date.now();
      if (!document.fullscreenElement) {
        fsExitStartRef.current = now;
        setFsExited(true);
        setLiveElapsedMs(0);
      } else if (fsExitStartRef.current != null) {
        const durationMs = now - fsExitStartRef.current;
        const at = new Date(fsExitStartRef.current).toISOString();
        fsExitStartRef.current = null;
        setFsExited(false);
        setExitCount((n) => n + 1);
        setExitTotalMs((v) => v + durationMs);
        void logBrowserEvent({ token, event: 'fullscreen_exit', at, durationMs });
      }
    };
    const onVis = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        visExitStartRef.current = now;
        setVisHidden(true);
        setLiveElapsedMs(0);
      } else if (document.visibilityState === 'visible' && visExitStartRef.current != null) {
        const durationMs = now - visExitStartRef.current;
        const at = new Date(visExitStartRef.current).toISOString();
        visExitStartRef.current = null;
        setVisHidden(false);
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

  // 응답 저장 (debounced 아닌 즉시. 재시도 3회)
  const runSave = async (questionId: string, payload: Record<string, unknown> | null) => {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await saveAnswer({
          token,
          questionId,
          sectionKind: currentSection,
          answer: (payload as never) ?? null
        });
        if (!res.error) return res;
      } catch {
        /* retry */
      }
      if (i < 2) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
    return { error: '저장 실패' };
  };

  // 문항별 debounce 타이머 관리
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const scheduleSave = (questionId: string, payload: Record<string, unknown> | null, delayMs: number) => {
    const timers = saveTimersRef.current;
    const prev = timers.get(questionId);
    if (prev) clearTimeout(prev);
    if (delayMs === 0) {
      timers.delete(questionId);
      void runSave(questionId, payload);
      return;
    }
    const t = setTimeout(() => {
      timers.delete(questionId);
      void runSave(questionId, payload);
    }, delayMs);
    timers.set(questionId, t);
  };

  // 라디오/카드 클릭 등 확정 액션 — 즉시 저장
  const setAnswerReplace = (next: Record<string, unknown>) => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: next }));
    const payload = Object.keys(next).length > 0 ? next : null;
    scheduleSave(question.id, payload, 0);
  };
  // textarea/input 등 연속 입력 — 500ms debounce
  const setAnswerFor = (patch: Record<string, unknown>) => {
    if (!question) return;
    const merged = { ...(answers[question.id] ?? {}), ...patch };
    setAnswers((prev) => ({ ...prev, [question.id]: merged }));
    const payload = Object.keys(merged).length > 0 ? merged : null;
    scheduleSave(question.id, payload, 500);
  };

  const handleToggleFlag = async () => {
    if (!question) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
    void toggleFlag({ token, questionId: question.id });
  };

  // 섹션 진행 → 다음 섹션 이동 (or 마지막이면 최종 제출)
  const handleAdvanceSection = async (timeoutReached: boolean) => {
    startTransition(async () => {
      const res = await submitSection({ token, sectionKind: currentSection, timeoutReached });
      if (res.error) {
        alert(res.error);
        return;
      }
      if (!res.nextSection) {
        // 마지막 섹션 종료 → 최종 제출
        await submitSession(token);
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
        router.push(`/exam/${token}/done`);
      } else {
        router.refresh();
      }
    });
  };

  const canGoPrev = currentIdx > 0;
  const canGoNext = currentIdx < sectionQuestions.length - 1;
  const answeredCount = sectionQuestions.filter((q) => (answers[q.id] ?? {}) && Object.keys(answers[q.id] ?? {}).length > 0).length;

  const currentSectionIdxInFlow = SECTION_ORDER.indexOf(currentSection);

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900 flex flex-col'>
      {/* 다중 탭 오버레이 */}
      {duplicateTab && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/85 backdrop-blur-sm p-6'>
          <div className='max-w-md w-full rounded-2xl bg-white p-8 shadow-2xl text-center border-4 border-slate-700'>
            <h2 className='text-xl font-bold text-slate-900 mb-2'>다른 탭에서 이미 응시 중입니다</h2>
            <p className='text-sm text-slate-600'>한 응시자는 하나의 창에서만 응시할 수 있습니다.</p>
          </div>
        </div>
      )}

      {/* 이탈 오버레이 */}
      {inExit && !isTask && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-rose-950/80 backdrop-blur-sm p-6'>
          <div className='max-w-md w-full rounded-2xl bg-white p-8 shadow-2xl text-center border-4 border-rose-500'>
            <h2 className='text-xl font-bold text-slate-900 mb-2'>전체화면 이탈 감지</h2>
            <p className='text-sm text-slate-600 mb-3'>시험 중 화면 이탈이 기록됩니다.</p>
            <div className='my-4 py-3 rounded-lg bg-rose-50 border border-rose-200'>
              <div className='font-mono text-3xl font-bold text-rose-700 tabular-nums'>
                {Math.round(liveElapsedMs / 1000)}초
              </div>
              <div className='text-[11px] text-rose-600 mt-1'>
                누적: {exitCount}회 · {Math.round(exitTotalMs / 1000)}초
              </div>
            </div>
            <button
              type='button'
              onClick={() => void requestReenterFullscreen()}
              className='w-full rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold px-6 py-3'
            >
              전체화면으로 복귀
            </button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <header className='sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-md'>
        <div className='mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4'>
          <div className='flex items-center gap-3 min-w-0'>
            <div className='h-8 w-8 rounded-md bg-slate-900 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0'>
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
              <div className='text-[10px] uppercase tracking-widest text-slate-400'>섹션</div>
              <div className='font-semibold text-slate-900'>
                {currentSectionIdxInFlow + 1}/3 · {SECTION_LABEL[currentSection]}
              </div>
            </div>
            {!isTask && exitCount > 0 && (
              <div className='text-xs text-right'>
                <div className='text-[10px] uppercase tracking-widest text-slate-400'>이탈</div>
                <div className='font-semibold text-amber-700 tabular-nums'>
                  {exitCount}회 · {Math.round(exitTotalMs / 1000)}초
                </div>
              </div>
            )}
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-2xl font-bold tabular-nums border-2 shadow-sm ${
                remaining <= 30
                  ? 'bg-rose-100 text-rose-700 border-rose-400 animate-pulse'
                  : remaining <= 60
                    ? 'bg-amber-100 text-amber-800 border-amber-400'
                    : 'bg-blue-50 text-blue-700 border-blue-300'
              }`}
            >
              {formatMinSec(remaining)}
            </div>
          </div>
        </div>
        <div className='h-1 bg-slate-100'>
          <div
            className='h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300'
            style={{ width: `${(remaining / sectionLimit) * 100}%` }}
          />
        </div>
      </header>

      <div className='flex-1 mx-auto max-w-6xl w-full px-6 py-6 flex gap-6'>
        {/* 좌측 문항 리스트 */}
        <aside className='w-56 flex-shrink-0'>
          <div className='sticky top-24 rounded-2xl border border-slate-200 bg-white shadow-sm p-4'>
            <div className='mb-3 flex items-center justify-between'>
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${SECTION_TONE[currentSection]}`}
              >
                {SECTION_LABEL[currentSection]}
              </span>
              <span className='text-[11px] text-slate-500 tabular-nums'>
                {answeredCount}/{sectionQuestions.length}
              </span>
            </div>
            <div className='grid grid-cols-5 gap-1.5'>
              {sectionQuestions.map((q, i) => {
                const isCurrent = i === currentIdx;
                const isAnswered = Object.keys(answers[q.id] ?? {}).length > 0;
                const isFlagged = flagged.has(q.id);
                const cls = isCurrent
                  ? 'bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-1'
                  : isFlagged
                    ? 'bg-amber-200 text-amber-900 ring-1 ring-amber-400 hover:bg-amber-300'
                    : isAnswered
                      ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200';
                return (
                  <button
                    key={q.id}
                    type='button'
                    onClick={() => setCurrentIdx(i)}
                    className={`relative aspect-square rounded-md text-xs font-semibold tabular-nums transition-colors ${cls}`}
                  >
                    {i + 1}
                    {isFlagged && (
                      <span className='absolute -top-1 -right-1 text-sm leading-none'>🚩</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className='mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px]'>
              <div className='flex items-center gap-1.5 text-slate-500'>
                <span className='inline-block w-3 h-3 rounded-sm bg-slate-100' /> 미응답
              </div>
              <div className='flex items-center gap-1.5 text-slate-500'>
                <span className='inline-block w-3 h-3 rounded-sm bg-blue-100' /> 응답 완료
              </div>
              <div className='flex items-center gap-1.5 text-slate-500'>
                <span className='inline-block w-3 h-3 rounded-sm bg-amber-200 ring-1 ring-amber-400' /> 🚩 검토 표시
              </div>
              <div className='flex items-center gap-1.5 text-slate-500'>
                <span className='inline-block w-3 h-3 rounded-sm bg-slate-900' /> 현재 문항
              </div>
            </div>
          </div>
        </aside>

        {/* 중앙: 문제 카드 */}
        <main className='flex-1 min-w-0'>
          {question && (
            <div className='rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden'>
              <div className='px-8 py-5 border-b border-slate-100 bg-slate-50/40 flex items-center gap-3 flex-wrap'>
                <span className='inline-flex items-center justify-center h-8 min-w-[3rem] px-2.5 rounded-md bg-slate-900 text-white text-sm font-bold tabular-nums'>
                  Q{currentIdx + 1}
                </span>
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${SECTION_TONE[question.type]}`}
                >
                  {SECTION_LABEL[question.type]}
                </span>
                {question.category && (
                  <span className='inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600'>
                    {question.category}
                  </span>
                )}
                <button
                  type='button'
                  onClick={() => void handleToggleFlag()}
                  className={`ml-auto inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                    flagged.has(question.id)
                      ? 'border-amber-400 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  🚩 {flagged.has(question.id) ? '검토 표시됨' : '검토 표시'}
                </button>
                <span className='text-[11px] text-slate-500'>
                  배점 <span className='font-semibold text-slate-900'>{question.score}점</span>
                </span>
              </div>

              <div className='px-8 pt-6 pb-4'>
                {/* 작업형 전용 안내 배너 — AI 자유 사용·이탈 허용 강조 */}
                {question.type === 'task_based' && (
                  <div className='mb-5 rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4'>
                    <div className='flex items-start gap-3'>
                      <div className='flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-500 text-white text-lg'>
                        ✓
                      </div>
                      <div className='flex-1 space-y-1.5 text-sm text-emerald-950'>
                        <div className='font-bold text-emerald-900'>
                          작업형 섹션 — 자유 작업 환경
                        </div>
                        <div className='space-y-0.5 text-[13px] leading-relaxed'>
                          <div>• <b>AI 코딩 에이전트 사용 가능</b> (Claude Code · Cursor · GPT · Copilot 등)</div>
                          <div>• <b>전체화면 이탈 자유</b> — 다른 창·IDE·터미널 자유롭게 사용하세요</div>
                          <div>• 인터넷 검색은 불가하며, 외부 LLM API·CDN도 사용 불가입니다</div>
                          <div>• 로컬 Ollama만 사용 가능 (첨부 zip에 model_config 포함)</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* 첨부파일 다운로드 카드 — 큰 버튼으로 강조 */}
                {question.attachment_url && (
                  <div className='mb-5 rounded-xl border-2 border-blue-300 bg-blue-50/60 p-4'>
                    <div className='flex items-center gap-4'>
                      <div className='flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-lg bg-blue-600 text-white text-xl'>
                        📎
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='text-[11px] font-semibold uppercase tracking-widest text-blue-700 mb-0.5'>
                          작업형 첨부파일
                        </div>
                        <div className='text-sm font-semibold text-slate-900 truncate'>
                          압축 파일 (config · data 포함)
                        </div>
                      </div>
                      <a
                        href={question.attachment_url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 shadow-sm transition-colors'
                      >
                        <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4'>
                          <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                          <polyline points='7 10 12 15 17 10' />
                          <line x1='12' x2='12' y1='15' y2='3' />
                        </svg>
                        다운로드
                      </a>
                    </div>
                  </div>
                )}
                <QuestionText text={question.text} />
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
                              className={`flex-1 leading-relaxed text-[15px] ${
                                selected ? 'text-blue-950 font-medium' : 'text-slate-700'
                              }`}
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
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!question) return;
                      const next = v ? { text: v } : {};
                      setAnswers((prev) => ({ ...prev, [question.id]: next }));
                      scheduleSave(question.id, v ? { text: v } : null, 500);
                    }}
                    className='w-full min-h-[140px] rounded-xl border-2 border-slate-200 bg-white px-5 py-4 text-[15px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none'
                    placeholder='답변을 입력하세요'
                  />
                )}

                {question.type === 'task_based' && (
                  <div className='space-y-5'>
                    {/* 문항별 제출 체크리스트 */}
                    {SUBMISSION_HINTS[question.code] && (
                      <div className='rounded-xl border-2 border-blue-200 bg-blue-50/50 p-4'>
                        <div className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-blue-800 mb-2'>
                          📋 이 문항 제출 체크리스트
                        </div>
                        <ul className='space-y-1'>
                          {SUBMISSION_HINTS[question.code].map((item, i) => (
                            <li key={i} className='flex items-start gap-2 text-sm text-blue-950'>
                              <span className='flex-shrink-0 mt-0.5 h-4 w-4 rounded border border-blue-400 bg-white' />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 파일 업로드 (필수) */}
                    <div>
                      <label className='flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5'>
                        결과물 파일
                        <span className='text-rose-500 text-[10px] font-bold'>* 필수</span>
                      </label>
                      <p className='text-xs text-slate-500 mb-2'>
                        위 체크리스트의 파일들을 모두 업로드하세요.
                      </p>
                      <TaskFileUpload
                        token={token}
                        files={((answer as { files?: UploadedFile[] }).files) ?? []}
                        onChange={(next) => setAnswerFor({ files: next })}
                      />
                    </div>

                    {/* 메모 (필수) */}
                    <div>
                      <label className='flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5'>
                        구현 메모
                        <span className='text-rose-500 text-[10px] font-bold'>* 필수</span>
                      </label>
                      <textarea
                        value={(answer as { notes?: string }).notes ?? ''}
                        onChange={(e) => setAnswerFor({ notes: e.target.value })}
                        className='w-full min-h-[120px] rounded-xl border-2 border-slate-200 bg-white px-5 py-4 text-[15px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none'
                        placeholder='실행 명령 · 사용한 Ollama 모델명 · 생성한 파일 목록 · 구현 방식 요약'
                      />
                    </div>

                    {/* GitHub URL (선택) */}
                    <div>
                      <label className='flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5'>
                        GitHub · 배포 URL
                        <span className='text-slate-400 text-[10px] font-normal normal-case tracking-normal'>(선택)</span>
                      </label>
                      <input
                        type='url'
                        value={(answer as { url?: string }).url ?? ''}
                        onChange={(e) => setAnswerFor({ url: e.target.value })}
                        className='w-full rounded-xl border-2 border-slate-200 bg-white px-5 py-3 text-[15px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100'
                        placeholder='https://github.com/... (파일 대신 URL로도 제출 가능)'
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 하단 이동 바 */}
          <div className='mt-4 flex items-center justify-between gap-3'>
            <button
              type='button'
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={!canGoPrev}
              className='rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed'
            >
              ← 이전 문항
            </button>

            {canGoNext ? (
              <button
                type='button'
                onClick={() => setCurrentIdx((i) => Math.min(sectionQuestions.length - 1, i + 1))}
                className='rounded-md border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50'
              >
                다음 문항 →
              </button>
            ) : (
              <button
                type='button'
                onClick={() => void handleAdvanceSection(false)}
                disabled={pending}
                className='rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold px-6 py-2.5 shadow-sm'
              >
                {pending
                  ? '이동 중...'
                  : SECTION_ORDER.indexOf(currentSection) === SECTION_ORDER.length - 1
                    ? '최종 제출'
                    : `다음 섹션 (${SECTION_LABEL[SECTION_ORDER[SECTION_ORDER.indexOf(currentSection) + 1]]}) →`}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function formatMinSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
