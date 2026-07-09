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

// 문항 코드별 제출 체크리스트 — 각 항목이 답변 상태로 자동 체크됨.
type SubmissionCheck = {
  label: string;
  check: (a: { files?: { name: string }[]; notes?: string }) => boolean;
};

const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const hasExt = (files: { name: string }[] | undefined, re: RegExp) =>
  !!files?.some((f) => re.test(f.name));
const countExt = (files: { name: string }[] | undefined, re: RegExp) =>
  files?.filter((f) => re.test(f.name)).length ?? 0;

const SUBMISSION_HINTS: Record<string, SubmissionCheck[]> = {
  // 실전 1기·2기 — 로컬 Ollama 도구 구축
  'T-E-036': [
    {
      label: '코드 파일 (app.py · index.html)',
      check: (a) => hasExt(a.files, /\.(py|html?)$/i)
    },
    {
      label: '질문 1·2 각각의 응답 화면 캡처 2장',
      check: (a) => countExt(a.files, IMG_EXT) >= 2
    },
    {
      label: '실행 명령 · Ollama 모델명 · 파일 목록 메모',
      check: (a) => (a.notes ?? '').trim().length >= 20
    }
  ],
  // 테스트 CBT — HTML 대시보드
  'PRACT-TB-001': [
    {
      label: 'HTML/CSS/JS 대시보드 파일 (index.html 등)',
      check: (a) => hasExt(a.files, /\.(html?|css|js)$/i)
    },
    {
      label: '샘플 CSV 파일 (동작 확인용)',
      check: (a) => hasExt(a.files, /\.csv$/i)
    },
    {
      label: '핵심 화면 캡처 1~2장',
      check: (a) => countExt(a.files, IMG_EXT) >= 1
    },
    {
      label: '계산 기준·사용 방법 메모',
      check: (a) => (a.notes ?? '').trim().length >= 20
    }
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

  // 다중 탭 감지 + 응시자가 하나 골라서 계속 응시할 수 있게 해제 옵션.
  // 예전에는 두 탭 모두 잠겨서 실수 시 시험 불가 → 하나 선택할 수 있게 개선.
  const bcRef = useRef<BroadcastChannel | null>(null);
  const [tabId] = useState(() => Math.random().toString(36).slice(2, 10));
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(`exam-${token}`);
    bcRef.current = bc;
    bc.postMessage({ type: 'hello', id: tabId });
    bc.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as { type?: string; id?: string };
      if (msg.type === 'hello' || msg.type === 'here') {
        if (msg.id === tabId) return; // 자기 자신 무시
        setDuplicateTab(true);
        if (msg.type === 'hello') bc.postMessage({ type: 'here', id: tabId });
      } else if (msg.type === 'claimed') {
        // 다른 탭이 '이 탭에서 계속' 선택 → 이 탭은 잠긴 상태 유지 (선택 못 함)
        if (msg.id !== tabId) setDuplicateTab(true);
      }
    };
    return () => {
      bcRef.current = null;
      bc.close();
    };
  }, [token, tabId]);

  const claimThisTab = () => {
    // BC로 '이 탭 사용 선언' 전송 → 다른 탭은 계속 잠긴 상태
    bcRef.current?.postMessage({ type: 'claimed', id: tabId });
    setDuplicateTab(false);
  };

  useEffect(() => {
    if (!inExit) return;
    const id = setInterval(() => {
      if (fsExitStartRef.current != null) setLiveElapsedMs(Date.now() - fsExitStartRef.current);
      else if (visExitStartRef.current != null) setLiveElapsedMs(Date.now() - visExitStartRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [inExit]);

  // 진입 시점에 이미 전체화면이 풀린 상태(브라우저의 페이지 이동 정책으로 종종 발생)면
  // 즉시 이탈 오버레이 표시해서 응시자가 '전체화면으로 복귀' 버튼 누르게 유도.
  // 단, 이 초기 상태는 실제 이탈이 아니므로 exitCount 카운트는 안 늘림 (fsExitStartRef 유지 X).
  useEffect(() => {
    if (isTask) return;
    if (!fullscreenRequired) return;
    if (!document.fullscreenElement) {
      // fsExitStartRef는 null로 두어 재진입 시 exitCount 증가 안 됨
      setFsExited(true);
    }
    // 마운트 직후 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isTask) return;
    const onFs = () => {
      const now = Date.now();
      if (!document.fullscreenElement) {
        // 이미 이탈 상태면 시작 시각 유지 (여러 번 fullscreenchange 재발화 방지)
        if (fsExitStartRef.current == null) fsExitStartRef.current = now;
        setFsExited(true);
        setLiveElapsedMs(0);
      }
      // fullscreen 복귀 시 자동 해제하지 않음 — 응시자가 오버레이의 '복귀' 버튼 눌러야 재개
    };
    const onVis = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        if (visExitStartRef.current == null) visExitStartRef.current = now;
        setVisHidden(true);
        setLiveElapsedMs(0);
      }
      // visible 복귀 시 자동 해제하지 않음 — Alt+Tab으로 다른 창 잠깐 봐도 오버레이 유지
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token, isTask]);

  // 응시자가 명시적으로 '복귀' 버튼을 눌러 오버레이 해제 (이탈 카운트·시간 기록).
  // 자동 해제하지 않아서 Alt+Tab으로 잠깐 봐도 시험 재개 불가.
  const acknowledgeReenter = async () => {
    const now = Date.now();
    // fullscreen 이탈 기록
    if (fsExitStartRef.current != null) {
      const durationMs = now - fsExitStartRef.current;
      const at = new Date(fsExitStartRef.current).toISOString();
      fsExitStartRef.current = null;
      setExitCount((n) => n + 1);
      setExitTotalMs((v) => v + durationMs);
      void logBrowserEvent({ token, event: 'fullscreen_exit', at, durationMs });
    }
    if (visExitStartRef.current != null) {
      const durationMs = now - visExitStartRef.current;
      const at = new Date(visExitStartRef.current).toISOString();
      visExitStartRef.current = null;
      setExitCount((n) => n + 1);
      setExitTotalMs((v) => v + durationMs);
      void logBrowserEvent({ token, event: 'visibility_hidden', at, durationMs });
    }
    // 전체화면 안 되어 있으면 재진입 요청
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        /* 사용자가 거부하면 오버레이 유지 */
        return;
      }
    }
    setFsExited(false);
    setVisHidden(false);
  };

  // 객관식·단답형 섹션에서 복사·우클릭·개발자도구 단축키 차단
  // 작업형은 자유 (외부 도구 사용 허용).
  useEffect(() => {
    if (isTask) return;
    // 우클릭 방지 (컨텍스트 메뉴로 '검사' 열기 차단)
    const onContext = (e: MouseEvent) => e.preventDefault();
    // 복사·잘라내기 차단 (문항 텍스트를 AI에 붙여넣기 방지)
    // 단답형 textarea에서 자기 답변은 복사 가능하도록 target 판단
    const isTextInput = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'TEXTAREA' || tag === 'INPUT';
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!isTextInput(e.target)) e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      if (!isTextInput(e.target)) e.preventDefault();
    };
    // 개발자도구·소스보기 단축키 차단
    const onKey = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12') { e.preventDefault(); return; }
      // Ctrl/Cmd + Shift + I/J/C (DevTools)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I','J','C','i','j','c'].includes(e.key)) {
        e.preventDefault(); return;
      }
      // Ctrl/Cmd + U (view source)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault(); return;
      }
      // Ctrl/Cmd + S (save page) — 지문 저장 방지
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); return;
      }
      // Ctrl/Cmd + P (print) — 지문 인쇄 방지
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault(); return;
      }
    };
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('keydown', onKey);
    };
  }, [isTask]);

  const requestReenterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* ignore */
    }
  };

  // 저장 상태 표시 (응시자 불안 제거)
  // idle: 표시 없음, saving: 저장 중, saved: 방금 저장됨(잠깐 표시), error: 실패
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // 서버 저장 성공한 문항 id — 좌측 그리드 상태 정확성 (client state != server state 방어)
  const [serverSavedIds, setServerSavedIds] = useState<Set<string>>(() => new Set(Object.keys(savedAnswers)));
  // 실패한 마지막 payload — '재시도' 버튼 클릭 시 다시 시도
  const failedRef = useRef<{ questionId: string; payload: Record<string, unknown> | null } | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 응답 저장 (debounced 아닌 즉시. 재시도 3회 + 상태 반영)
  const runSave = async (questionId: string, payload: Record<string, unknown> | null) => {
    setSaveState('saving');
    for (let i = 0; i < 3; i++) {
      try {
        const res = await saveAnswer({
          token,
          questionId,
          sectionKind: currentSection,
          answer: (payload as never) ?? null
        });
        if (!res.error) {
          // 성공: 서버 저장 확정
          if (payload && Object.keys(payload).length > 0) {
            setServerSavedIds((prev) => {
              if (prev.has(questionId)) return prev;
              const next = new Set(prev);
              next.add(questionId);
              return next;
            });
          } else {
            // 빈 답변으로 저장한 경우 = 삭제
            setServerSavedIds((prev) => {
              if (!prev.has(questionId)) return prev;
              const next = new Set(prev);
              next.delete(questionId);
              return next;
            });
          }
          failedRef.current = null;
          setSaveState('saved');
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
          return res;
        }
      } catch {
        /* retry */
      }
      if (i < 2) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
    // 3회 다 실패
    failedRef.current = { questionId, payload };
    setSaveState('error');
    return { error: '저장 실패' };
  };

  const retryFailedSave = () => {
    const f = failedRef.current;
    if (!f) return;
    void runSave(f.questionId, f.payload);
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

  // 최종 제출 확인 다이얼로그 상태
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [finalAgree, setFinalAgree] = useState(false);

  // 섹션 진행 → 다음 섹션 이동 (or 마지막이면 최종 제출)
  // 마지막 섹션인 경우 submitSection이 자동채점까지 함께 처리 → 서버 왕복 1회로 단축
  const handleAdvanceSection = async (timeoutReached: boolean) => {
    startTransition(async () => {
      // pending debounce 강제 flush (마지막 textarea 저장 유실 방지)
      const timers = saveTimersRef.current;
      for (const [, t] of timers) clearTimeout(t);
      timers.clear();

      const res = await submitSection({ token, sectionKind: currentSection, timeoutReached });
      if (res.error) {
        alert(res.error);
        return;
      }
      if (!res.nextSection) {
        // 마지막 섹션 종료 = 서버에서 이미 최종 제출·자동채점 완료
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
        router.push(`/exam/${token}/done`);
      } else {
        router.refresh();
      }
    });
  };

  const isFinalSection = SECTION_ORDER.indexOf(currentSection) === SECTION_ORDER.length - 1;
  const nextSectionKind = isFinalSection ? null : SECTION_ORDER[SECTION_ORDER.indexOf(currentSection) + 1];

  // 모든 섹션 전환에 확인 다이얼로그 (실수 방지)
  const handleFinalSubmitClick = () => {
    setFinalAgree(false);
    setShowFinalConfirm(true);
  };
  const confirmFinalSubmit = () => {
    setShowFinalConfirm(false);
    void handleAdvanceSection(false);
  };
  const cancelFinalSubmit = () => setShowFinalConfirm(false);

  // 현재 섹션의 미답변 개수 (섹션 이동 확인용)
  // 서버 저장 성공한 문항만 답변 완료로 인정 (실패한 답변은 미답변 취급 → 응시자에게 경고)
  const unansweredCurrent = sectionQuestions.filter((q) => !serverSavedIds.has(q.id)).length;

  const canGoPrev = currentIdx > 0;
  const canGoNext = currentIdx < sectionQuestions.length - 1;
  const answeredCount = sectionQuestions.filter((q) => serverSavedIds.has(q.id)).length;

  const currentSectionIdxInFlow = SECTION_ORDER.indexOf(currentSection);

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900 flex flex-col'>
      {/* 다중 탭 오버레이 */}
      {/* 제출·이동 진행 중 전면 로딩 오버레이 (서버 왕복 몇 초 응시자 안심용) */}
      {pending && !showFinalConfirm && (
        <div className='fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm'>
          <div className='rounded-2xl bg-white px-8 py-6 shadow-2xl border-2 border-slate-200 flex items-center gap-4'>
            <div className='h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin' />
            <div>
              <div className='text-sm font-bold text-slate-900'>
                {isFinalSection ? '제출 중…' : '다음 섹션으로 이동 중…'}
              </div>
              <div className='text-xs text-slate-500 mt-0.5'>잠시만 기다려주세요</div>
            </div>
          </div>
        </div>
      )}
      {duplicateTab && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/85 backdrop-blur-sm p-6'>
          <div className='max-w-md w-full rounded-2xl bg-white p-8 shadow-2xl text-center border-4 border-slate-700'>
            <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-xl'>
              ⚠
            </div>
            <h2 className='text-xl font-bold text-slate-900 mb-2'>다른 탭에서도 열려 있습니다</h2>
            <p className='text-sm text-slate-600 mb-6 leading-relaxed'>
              같은 시험이 여러 탭에서 열렸습니다.
              <br />
              <b>이 탭에서 계속</b> 버튼을 누르면 다른 탭은 자동으로 잠깁니다.
            </p>
            <button
              type='button'
              onClick={claimThisTab}
              className='w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 shadow-sm'
            >
              이 탭에서 계속 응시
            </button>
            <p className='mt-3 text-[11px] text-slate-400'>다른 탭에서 계속 응시하려면 그 탭에서 같은 버튼을 누르세요.</p>
          </div>
        </div>
      )}

      {/* 이탈 오버레이 */}
      {inExit && !isTask && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-rose-950/80 backdrop-blur-sm p-6'>
          <div className='max-w-md w-full rounded-2xl bg-white p-8 shadow-2xl text-center border-4 border-rose-500'>
            {fsExitStartRef.current == null && visExitStartRef.current == null ? (
              // 초기 진입 시(브라우저 페이지 이동으로 fullscreen 풀린 경우) — 카운트 표시 X
              <>
                <h2 className='text-xl font-bold text-slate-900 mb-2'>전체화면으로 진입해주세요</h2>
                <p className='text-sm text-slate-600 mb-5'>
                  시험은 전체화면 모드에서만 진행됩니다.
                  <br />
                  아래 버튼을 눌러 전체화면으로 진입하세요.
                </p>
              </>
            ) : (
              // 실제 이탈 감지
              <>
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
              </>
            )}
            <button
              type='button'
              onClick={() => void acknowledgeReenter()}
              className='w-full rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold px-6 py-3'
            >
              {fsExitStartRef.current == null && visExitStartRef.current == null
                ? '전체화면으로 진입'
                : '전체화면으로 복귀'}
            </button>
          </div>
        </div>
      )}

      {/* 섹션 종료 / 최종 제출 확인 다이얼로그 */}
      {showFinalConfirm && (
        <div className='fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-6'>
          <div className='max-w-md w-full rounded-2xl bg-white shadow-2xl border-2 border-slate-200 overflow-hidden'>
            <div className='px-6 pt-6 pb-4 border-b border-slate-100'>
              <div className='flex items-center gap-3'>
                <div className='flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600'>
                  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-6 w-6'>
                    <path d='M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' />
                    <line x1='12' x2='12' y1='9' y2='13' />
                    <line x1='12' x2='12.01' y1='17' y2='17' />
                  </svg>
                </div>
                <div>
                  <h2 className='text-lg font-bold text-slate-900'>
                    {isFinalSection
                      ? '최종 제출하시겠습니까?'
                      : `${SECTION_LABEL[currentSection]} 섹션을 종료하시겠습니까?`}
                  </h2>
                  <p className='text-xs text-slate-500 mt-0.5'>
                    {isFinalSection
                      ? '제출 후에는 답변을 수정할 수 없습니다.'
                      : `종료하면 ${nextSectionKind ? SECTION_LABEL[nextSectionKind] : ''} 섹션으로 이동하며, ${SECTION_LABEL[currentSection]}으로 되돌아갈 수 없습니다.`}
                  </p>
                </div>
              </div>
            </div>

            <div className='px-6 py-4 space-y-3 bg-slate-50/50'>
              <div className='flex items-center justify-between rounded-lg bg-white border border-slate-200 px-3 py-2.5'>
                <span className='text-xs text-slate-500'>
                  {SECTION_LABEL[currentSection]} 섹션 미답변
                </span>
                <span className={`text-sm font-bold tabular-nums ${unansweredCurrent > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {unansweredCurrent}개 / {sectionQuestions.length}개 중
                </span>
              </div>
              <div className='flex items-center justify-between rounded-lg bg-white border border-slate-200 px-3 py-2.5'>
                <span className='text-xs text-slate-500'>이 섹션 남은 시간</span>
                <span className='font-mono text-sm font-bold text-slate-900 tabular-nums'>
                  {formatMinSec(Math.max(0, remaining))}
                </span>
              </div>
              {unansweredCurrent > 0 && (
                <div className='rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800'>
                  ⚠ 아직 답하지 않은 문항이 <b>{unansweredCurrent}개</b> 남아 있습니다. 그래도 {isFinalSection ? '제출' : '이동'}하시겠어요?
                </div>
              )}
            </div>

            <div className='px-6 py-4'>
              <label className='flex items-start gap-2.5 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={finalAgree}
                  onChange={(e) => setFinalAgree(e.target.checked)}
                  className='mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500'
                />
                <span className='text-sm text-slate-700 leading-snug'>
                  {isFinalSection ? (
                    <>
                      모든 답변을 검토했으며 <b className='text-slate-900'>최종 제출에 동의</b>합니다.
                      <br />
                      <span className='text-xs text-slate-500'>(제출 후 답변 수정·재응시 불가)</span>
                    </>
                  ) : (
                    <>
                      {SECTION_LABEL[currentSection]} 답변을 검토했으며 <b className='text-slate-900'>다음 섹션으로 이동에 동의</b>합니다.
                      <br />
                      <span className='text-xs text-slate-500'>(이동 후 이 섹션으로 되돌아올 수 없음)</span>
                    </>
                  )}
                </span>
              </label>
            </div>

            <div className='px-6 pb-6 flex gap-2'>
              <button
                type='button'
                onClick={cancelFinalSubmit}
                disabled={pending}
                className='flex-1 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 text-sm'
              >
                취소하고 계속 응시
              </button>
              <button
                type='button'
                onClick={confirmFinalSubmit}
                disabled={!finalAgree || pending}
                className='flex-1 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 text-sm shadow-sm'
              >
                {pending
                  ? '이동 중…'
                  : isFinalSection
                    ? '최종 제출'
                    : `${nextSectionKind ? SECTION_LABEL[nextSectionKind] : ''}으로 이동`}
              </button>
            </div>
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
            {/* 저장 상태 배지 */}
            {saveState !== 'idle' && (
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  saveState === 'saving'
                    ? 'border-slate-300 bg-slate-100 text-slate-600'
                    : saveState === 'saved'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-rose-400 bg-rose-100 text-rose-700 animate-pulse'
                }`}
              >
                {saveState === 'saving' && (
                  <>
                    <span className='inline-block h-1.5 w-1.5 rounded-full bg-slate-500 animate-pulse' />
                    저장 중…
                  </>
                )}
                {saveState === 'saved' && (
                  <>
                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' className='h-3 w-3'>
                      <polyline points='20 6 9 17 4 12' />
                    </svg>
                    저장됨
                  </>
                )}
                {saveState === 'error' && (
                  <>
                    <span className='text-sm'>⚠</span>
                    저장 실패
                  </>
                )}
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
        {/* 저장 실패 배너 (헤더 바로 아래, 재시도 버튼) */}
        {saveState === 'error' && (
          <div className='border-t border-rose-300 bg-rose-50 px-6 py-2.5'>
            <div className='mx-auto max-w-6xl flex items-center justify-between gap-3'>
              <div className='flex items-center gap-2 text-sm text-rose-900'>
                <span className='text-lg'>⚠</span>
                <span>
                  <b>답변 저장에 실패했습니다.</b> 인터넷 연결을 확인하고 재시도해 주세요. (미저장된 답변은 서버에 기록되지 않습니다)
                </span>
              </div>
              <button
                type='button'
                onClick={retryFailedSave}
                className='flex-shrink-0 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold px-4 py-1.5 shadow-sm'
              >
                재시도
              </button>
            </div>
          </div>
        )}
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
                // 서버에 저장된 답변만 '답변됨'으로 표시 (client-only 상태는 함정)
                const isAnswered = serverSavedIds.has(q.id);
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
                <div className={isTask ? '' : 'select-none'} style={isTask ? {} : { userSelect: 'none', WebkitUserSelect: 'none' }}>
                  <QuestionText text={question.text} />
                </div>
              </div>

              <div className='px-8 pt-2 pb-8'>
                {question.type === 'multiple_choice' && question.choices && (
                  <div className='space-y-2.5 select-none' style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
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
                    {/* 문항별 제출 체크리스트 (파일·메모 상태로 자동 체크) */}
                    {SUBMISSION_HINTS[question.code] && (() => {
                      const items = SUBMISSION_HINTS[question.code];
                      const ans = answer as { files?: { name: string }[]; notes?: string };
                      const doneCount = items.filter((it) => it.check(ans)).length;
                      const allDone = doneCount === items.length;
                      return (
                        <div className={`rounded-xl border-2 p-4 transition-colors ${
                          allDone ? 'border-emerald-300 bg-emerald-50/60' : 'border-blue-200 bg-blue-50/50'
                        }`}>
                          <div className='flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest mb-2'>
                            <span className={allDone ? 'text-emerald-800' : 'text-blue-800'}>
                              📋 이 문항 제출 체크리스트
                            </span>
                            <span className={`tabular-nums ${allDone ? 'text-emerald-700' : 'text-blue-600'}`}>
                              {doneCount} / {items.length}
                            </span>
                          </div>
                          <ul className='space-y-1'>
                            {items.map((item, i) => {
                              const done = item.check(ans);
                              return (
                                <li key={i} className={`flex items-start gap-2 text-sm ${done ? 'text-emerald-900' : 'text-blue-950'}`}>
                                  <span className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                                    done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-blue-400 bg-white'
                                  }`}>
                                    {done && (
                                      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' className='h-3 w-3'>
                                        <polyline points='20 6 9 17 4 12' />
                                      </svg>
                                    )}
                                  </span>
                                  <span className={done ? 'line-through opacity-70' : ''}>{item.label}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })()}

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
                        onChange={(next) => {
                          // 파일 목록 변경은 debounce 없이 즉시 서버 저장 (파일 자체는 이미 Storage 저장됨).
                          if (!question) return;
                          const merged = { ...(answers[question.id] ?? {}), files: next };
                          setAnswers((prev) => ({ ...prev, [question.id]: merged }));
                          scheduleSave(question.id, merged, 0);
                        }}
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
                onClick={handleFinalSubmitClick}
                disabled={pending}
                className='rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold px-6 py-2.5 shadow-sm'
              >
                {pending
                  ? '이동 중...'
                  : isFinalSection
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
