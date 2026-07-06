import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ examId: string; sessionId: string }> };

const EVENT_LABEL: Record<string, string> = {
  fullscreen_exit: '전체화면 이탈',
  visibility_hidden: '창 전환'
};

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
    .select('question_id, answer_value, submitted_at, feedback, visited_at')
    .eq('session_id', sessionId);

  const respMap = new Map(
    (responses ?? []).map((r) => [
      r.question_id,
      {
        answer: (r.answer_value as Record<string, unknown> | null) ?? null,
        submittedAt: r.submitted_at,
        feedback: r.feedback,
        visitedAt: r.visited_at
      }
    ])
  );

  const events = Array.isArray(session.browser_events)
    ? (session.browser_events as unknown as { event: string; at: string }[])
    : [];
  const eventSummary = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.event] = (acc[e.event] ?? 0) + 1;
    return acc;
  }, {});

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
          <Stat label='상태' value={session.status} />
          <Stat
            label='시작 / 제출'
            value={
              (session.started_at
                ? new Date(session.started_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
                : '-') +
              ' / ' +
              (session.submitted_at
                ? new Date(session.submitted_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
                : '-')
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
                {Object.entries(eventSummary).map(([k, v]) => (
                  <Badge key={k} variant='outline' className='bg-amber-50 text-amber-800 border-amber-200'>
                    {EVENT_LABEL[k] ?? k} × {v}
                  </Badge>
                ))}
              </div>
              <details className='rounded-md border bg-card'>
                <summary className='cursor-pointer px-4 py-2 text-sm font-medium'>
                  타임라인 ({events.length}건)
                </summary>
                <ol className='divide-y'>
                  {events.map((e, i) => (
                    <li key={i} className='px-4 py-2 text-xs flex justify-between'>
                      <span>{EVENT_LABEL[e.event] ?? e.event}</span>
                      <span className='text-muted-foreground tabular-nums'>
                        {new Date(e.at).toLocaleString('ko-KR')}
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
                displayAnswer = '(작업형 — 수동 채점)';
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
                    {q.difficulty && (
                      <Badge variant='outline' className='text-xs'>
                        난이도 {q.difficulty}
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
