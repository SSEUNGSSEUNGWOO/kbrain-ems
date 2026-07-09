import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { ManualScoreForm } from './_components/manual-score-form';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ examId: string; sessionId: string }> };

const EVENT_LABEL: Record<string, string> = {
  fullscreen_exit: '전체화면 이탈',
  visibility_hidden: '창 전환'
};

// 응시자 관점 뱃지 통일 — submitted·graded 모두 '제출완료' (자동채점 여부는 점수 컬럼이 구분)
const STATUS_LABEL: Record<string, string> = {
  in_progress: '진행중',
  submitted: '제출완료',
  graded: '제출완료'
};

// Vercel(UTC)에서 서버 렌더되므로 KST 지정 필수. dateStyle/timeStyle 컴팩트.
function formatKst(iso: string, opts?: { long?: boolean }): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: opts?.long ? 'medium' : 'short',
    timeStyle: opts?.long ? 'medium' : 'short'
  });
}

export default async function ExamSessionDetailPage({ params }: Props) {
  if (!(await isDeveloper())) notFound();
  const { examId, sessionId } = await params;
  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from('exam_sessions')
    .select(
      'id, exam_id, name, email, token, status, started_at, submitted_at, auto_score, manual_score, total_score, browser_events, current_order_no'
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.exam_id !== examId) notFound();

  const { data: qie } = await supabase
    .from('exam_questions_in_exam')
    .select(
      'order_no, question_id, exam_questions(id, type, text, score, choices, correct, category, difficulty)'
    )
    .eq('exam_id', examId)
    .order('order_no');

  const { data: responses } = await supabase
    .from('exam_responses')
    .select('question_id, answer_value, submitted_at, feedback, visited_at, manual_score')
    .eq('session_id', sessionId);

  const respMap = new Map(
    (responses ?? []).map((r) => [
      r.question_id,
      {
        answer: (r.answer_value as Record<string, unknown> | null) ?? null,
        submittedAt: r.submitted_at,
        feedback: r.feedback,
        visitedAt: r.visited_at,
        manualScore: r.manual_score
      }
    ])
  );

  const events = Array.isArray(session.browser_events)
    ? (session.browser_events as unknown as { event: string; at: string; duration_ms?: number }[])
    : [];
  const eventStats: Record<
    string,
    { count: number; totalMs: number; maxMs: number; withDuration: number }
  > = {};
  for (const e of events) {
    const st = (eventStats[e.event] ??= { count: 0, totalMs: 0, maxMs: 0, withDuration: 0 });
    st.count++;
    if (e.duration_ms != null) {
      st.withDuration++;
      st.totalMs += e.duration_ms;
      if (e.duration_ms > st.maxMs) st.maxMs = e.duration_ms;
    }
  }

  type Q = {
    id: string;
    type: 'multiple_choice' | 'short_text' | 'task_based';
    text: string;
    score: number;
    choices: { key: string; text: string }[] | null;
    correct: unknown;
    category: string | null;
    difficulty: string | null;
  };
  const questions = (qie ?? []).map((r) => ({
    order_no: r.order_no,
    q: (r as unknown as { exam_questions: Q }).exam_questions
  }));

  return (
    <PageContainer
      pageTitle={session.name ?? '응시자 상세'}
      pageDescription={`${session.email ?? '(이메일 없음)'} · 토큰 ${session.token ?? '-'}`}
    >
      <div className='space-y-6'>
        {/* 요약 */}
        <div className='grid gap-3 sm:grid-cols-2 md:grid-cols-4'>
          <Stat label='상태' value={STATUS_LABEL[session.status] ?? session.status} />
          <Stat
            label='시작 / 제출'
            value={
              (session.started_at ? formatKst(session.started_at) : '-') +
              ' / ' +
              (session.submitted_at ? formatKst(session.submitted_at) : '-')
            }
          />
          <Stat label='자동 채점' value={session.auto_score != null ? `${session.auto_score}점` : '-'} />
          <Stat
            label='총점'
            value={session.total_score != null ? `${session.total_score}점` : '(수동 채점 대기)'}
          />
        </div>

        {/* 이벤트 요약 */}
        <section>
          <h2 className='text-sm font-semibold mb-2'>브라우저 이벤트</h2>
          {events.length === 0 ? (
            <p className='text-muted-foreground text-sm rounded-md border bg-card p-4'>
              이벤트 없음 (전체화면 이탈·창 전환 감지 안 됨)
            </p>
          ) : (
            <div className='space-y-3'>
              <div className='flex flex-wrap gap-2'>
                {Object.entries(eventStats).map(([k, st]) => (
                  <Badge key={k} variant='outline' className='bg-amber-50 text-amber-800 border-amber-200'>
                    {EVENT_LABEL[k] ?? k} {st.count}회
                    {st.withDuration > 0 && (
                      <span className='ml-1 opacity-80'>
                        · 총 {formatSec(st.totalMs)} · 최장 {formatSec(st.maxMs)}
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
              <details className='rounded-md border bg-card'>
                <summary className='cursor-pointer px-4 py-2 text-sm font-medium'>
                  타임라인 ({events.length}건)
                </summary>
                <ol className='divide-y'>
                  {events.map((e, i) => (
                    <li key={i} className='px-4 py-2 text-xs flex justify-between gap-3'>
                      <span>{EVENT_LABEL[e.event] ?? e.event}</span>
                      <span className='text-muted-foreground tabular-nums'>
                        {formatKst(e.at, { long: true })}
                        {e.duration_ms != null && ` · ${formatSec(e.duration_ms)}`}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          )}
        </section>

        {/* 문항별 응답 */}
        <section>
          <h2 className='text-sm font-semibold mb-2'>문항별 응답</h2>
          <div className='space-y-3'>
            {questions.map(({ order_no, q }) => {
              const r = respMap.get(q.id);
              const ans = r?.answer ?? null;
              let displayAnswer = '(미응답)';
              let correctness: 'correct' | 'wrong' | 'pending' = 'pending';

              if (q.type === 'multiple_choice') {
                const key = (ans as { key?: string } | null)?.key;
                if (key) displayAnswer = key;
                const correctKey = (q.correct as { key?: string } | null)?.key;
                if (key) correctness = key === correctKey ? 'correct' : 'wrong';
              } else if (q.type === 'short_text') {
                const text = (ans as { text?: string } | null)?.text;
                if (text) displayAnswer = text;
                const keywords = ((q.correct as { keywords?: string[] } | null)?.keywords ?? []).map(
                  (k) => k.trim().toLowerCase()
                );
                if (text) {
                  correctness = keywords.some((k) => text.trim().toLowerCase() === k)
                    ? 'correct'
                    : 'wrong';
                }
              } else {
                // task_based: 응답 값을 사람이 읽을 수 있는 형태로 (파일 목록은 아래에서 별도 표시)
                const parts: string[] = [];
                const filesCount = ((ans as { files?: unknown[] } | null)?.files ?? []).length;
                if (filesCount > 0) parts.push(`📎 파일 ${filesCount}개 (아래 목록 참조)`);
                if ((ans as { notes?: string } | null)?.notes) {
                  parts.push(`📝 메모: ${(ans as { notes: string }).notes}`);
                }
                if ((ans as { url?: string } | null)?.url) {
                  parts.push(`🔗 URL: ${(ans as { url: string }).url}`);
                }
                displayAnswer = parts.length > 0 ? parts.join('\n\n') : '(미제출)';
                correctness = 'pending';
              }

              return (
                <div key={q.id} className='rounded-md border bg-card p-4 space-y-2'>
                  <div className='flex items-center gap-2'>
                    <span className='text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-white'>
                      Q{order_no}
                    </span>
                    {q.category && (
                      <Badge variant='outline' className='text-xs'>
                        {q.category}
                      </Badge>
                    )}
                    <span className='text-xs text-muted-foreground ml-auto'>배점 {q.score}점</span>
                    {correctness === 'correct' && (
                      <Badge className='bg-emerald-100 text-emerald-800 border-emerald-200'>정답</Badge>
                    )}
                    {correctness === 'wrong' && (
                      <Badge className='bg-rose-100 text-rose-800 border-rose-200'>오답</Badge>
                    )}
                    {r?.feedback && (
                      <Badge variant='outline' className='bg-amber-50 text-amber-700 border-amber-200'>
                        {r.feedback}
                      </Badge>
                    )}
                  </div>
                  <div className='text-sm whitespace-pre-wrap text-muted-foreground line-clamp-2'>
                    {q.text}
                  </div>
                  <div className='grid gap-2 sm:grid-cols-2 text-sm'>
                    <div>
                      <div className='text-xs text-muted-foreground mb-0.5'>응답</div>
                      <div className='rounded bg-slate-50 border px-3 py-2 whitespace-pre-wrap break-words'>
                        {displayAnswer}
                      </div>
                    </div>
                    <div>
                      <div className='text-xs text-muted-foreground mb-0.5'>정답</div>
                      <div className='rounded bg-slate-50 border px-3 py-2 whitespace-pre-wrap break-words font-mono text-xs'>
                        {formatCorrect(q)}
                      </div>
                    </div>
                  </div>
                  {q.type === 'task_based' && (() => {
                    const files = ((ans as { files?: { name: string; url: string; size: number; path: string }[] } | null)?.files) ?? [];
                    return files.length > 0 ? (
                      <div className='rounded-md border border-blue-200 bg-blue-50/40 p-3'>
                        <div className='text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1.5'>
                          📎 첨부 파일 <span className='text-blue-600'>({files.length}개)</span>
                        </div>
                        <ul className='space-y-1.5'>
                          {files.map((f, i) => (
                            <li key={f.path ?? i} className='flex items-center gap-3 rounded bg-white border border-slate-200 px-3 py-2'>
                              <span className='text-lg flex-shrink-0'>📄</span>
                              <div className='flex-1 min-w-0'>
                                <div className='text-sm text-slate-800 truncate' title={f.name}>{f.name}</div>
                                <div className='text-[11px] text-slate-500'>{(f.size / 1024).toFixed(1)} KB</div>
                              </div>
                              <a
                                href={f.url}
                                target='_blank'
                                rel='noopener noreferrer'
                                download={f.name}
                                className='flex-shrink-0 inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5'
                              >
                                ↓ 다운로드
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null;
                  })()}
                  {q.type === 'task_based' && (
                    <ManualScoreForm
                      examId={examId}
                      sessionId={sessionId}
                      questionId={q.id}
                      maxScore={q.score}
                      currentScore={r?.manualScore ?? null}
                      currentFeedback={r?.feedback ?? null}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md border bg-card px-4 py-3'>
      <div className='text-muted-foreground text-[10px] uppercase tracking-widest'>{label}</div>
      <div className='text-sm font-semibold mt-0.5'>{value}</div>
    </div>
  );
}

function formatSec(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs === 0 ? `${m}분` : `${m}분 ${rs}초`;
}

function formatCorrect(q: { type: string; correct: unknown; choices: { key: string; text: string }[] | null }): string {
  if (q.type === 'multiple_choice') {
    const key = (q.correct as { key?: string } | null)?.key;
    return key ?? '-';
  }
  if (q.type === 'short_text') {
    const keywords = (q.correct as { keywords?: string[] } | null)?.keywords ?? [];
    return keywords.join(' / ') || '-';
  }
  return '(수동 채점)';
}
