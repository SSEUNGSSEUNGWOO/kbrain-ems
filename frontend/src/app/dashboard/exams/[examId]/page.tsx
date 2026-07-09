import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';
import { isMultipleChoiceCorrect, isShortAnswerCorrect } from '@/lib/exam-grading';
import { ShareLinkCopy } from './_components/share-link-copy';
import { SessionsTable, type SessionRow } from './_components/sessions-table';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ examId: string }> };

// 응시자 관점에서 '제출'과 '채점완료'는 헷갈리기만 함.
// 채점 완료 여부는 점수 컬럼(total_score vs auto_score)이 이미 명확히 표시하므로
// 뱃지는 '진행중' vs '제출완료' 이분으로 단순화.
// (formatKst · formatSecFromMs 유틸은 sessions-table.tsx 내부에서 자체 정의)
const STATUS_LABEL: Record<string, string> = {
  in_progress: '진행중',
  submitted: '제출완료',
  graded: '제출완료'
};
const STATUS_TONE: Record<string, string> = {
  in_progress: 'bg-slate-100 text-slate-700 border-slate-300',
  submitted: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  graded: 'bg-emerald-50 text-emerald-800 border-emerald-200'
};

export default async function ExamDetailPage({ params }: Props) {
  if (!(await isDeveloper())) notFound();
  const { examId } = await params;
  const supabase = createAdminClient();

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, description, share_code, fullscreen_required, time_limit_minutes')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) notFound();

  const { count: totalQ } = await supabase
    .from('exam_questions_in_exam')
    .select('question_id', { count: 'exact', head: true })
    .eq('exam_id', examId);

  const { data: sessions } = await supabase
    .from('exam_sessions')
    .select(
      'id, token, name, email, status, started_at, submitted_at, current_order_no, auto_score, manual_score, total_score, browser_events, created_at'
    )
    .eq('exam_id', examId)
    .order('created_at', { ascending: true });

  // 문항 마스터 조회 — 섹션별 점수 집계용 (type, score, correct)
  const { data: qie } = await supabase
    .from('exam_questions_in_exam')
    .select('question_id, exam_questions(id, type, score, correct)')
    .eq('exam_id', examId);
  type QMeta = {
    id: string;
    type: 'multiple_choice' | 'short_text' | 'task_based';
    score: number;
    correct: unknown;
  };
  const qById = new Map<string, QMeta>();
  const sectionMax = { multiple_choice: 0, short_text: 0, task_based: 0 };
  for (const r of (qie ?? []) as unknown as { question_id: string; exam_questions: QMeta }[]) {
    const q = r.exam_questions;
    if (!q) continue;
    qById.set(q.id, q);
    sectionMax[q.type] += q.score;
  }

  // 세션당 응답을 한 번에 조회 (N+1 방지, 앞선 export route와 동일 패턴)
  const sessionIds = (sessions ?? []).map((s) => s.id);
  type RespRow = {
    session_id: string;
    question_id: string;
    answer_value: Record<string, unknown> | null;
    manual_score: number | null;
  };
  const allResponses: RespRow[] = [];
  if (sessionIds.length > 0) {
    // PostgREST 1000-row 우회: chunk fetch (24명 × 36 = 864이라 넉넉히 커버되지만 방어)
    let from = 0;
    const CHUNK = 1000;
    for (;;) {
      const { data: chunk } = await supabase
        .from('exam_responses')
        .select('session_id, question_id, answer_value, manual_score')
        .in('session_id', sessionIds)
        .range(from, from + CHUNK - 1);
      const rows = (chunk ?? []) as unknown as RespRow[];
      allResponses.push(...rows);
      if (rows.length < CHUNK) break;
      from += CHUNK;
    }
  }

  // 응시자별 섹션 점수 집계.
  // 객관식·단답 = 자동채점 (정답 여부 × 만점), 작업형 = manual_score (null이면 대기).
  type Scored = {
    mc: number;
    st: number;
    task: number | null; // null = 아직 수동채점 대기
    taskHasResponse: boolean;
  };
  const scoreBySession = new Map<string, Scored>();
  for (const sid of sessionIds) scoreBySession.set(sid, { mc: 0, st: 0, task: null, taskHasResponse: false });
  for (const r of allResponses) {
    const q = qById.get(r.question_id);
    if (!q) continue;
    const s = scoreBySession.get(r.session_id);
    if (!s) continue;
    try {
      if (q.type === 'multiple_choice') {
        const ansKey = (r.answer_value as { key?: string } | null)?.key;
        const correctKey = (q.correct as { key?: string } | null)?.key;
        if (isMultipleChoiceCorrect(ansKey, correctKey)) s.mc += q.score;
      } else if (q.type === 'short_text') {
        const text = (r.answer_value as { text?: string } | null)?.text ?? null;
        const keywords = ((q.correct as { keywords?: string[] } | null)?.keywords ?? []);
        if (isShortAnswerCorrect(text, keywords)) s.st += q.score;
      } else if (q.type === 'task_based') {
        s.taskHasResponse = true;
        if (r.manual_score != null) {
          s.task = (s.task ?? 0) + r.manual_score;
        }
      }
    } catch {
      // 개별 채점 예외는 무시
    }
  }

  return (
    <PageContainer
      pageTitle={exam.name}
      pageDescription={`공유코드 ${exam.share_code ?? '-'} · 총 ${totalQ ?? 0}문항${exam.fullscreen_required ? ' · 전체화면 필수' : ''}`}
      pageHeaderAction={
        <div className='flex items-center gap-2'>
          <a
            href={`/api/exams/${examId}/export`}
            className='inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-slate-50'
          >
            결과 다운로드
          </a>
        </div>
      }
    >
      {exam.share_code && (
        <div className='mb-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4'>
          <div className='text-xs font-semibold uppercase tracking-widest text-blue-700 mb-2'>
            응시자 배포용 공유 링크
          </div>
          <ShareLinkCopy shareCode={exam.share_code} />
          <div className='mt-2 text-xs text-blue-800'>
            이 URL을 카톡·이메일로 배포하세요. 응시자는 이름·전화번호 뒷 4자리로 진입합니다.
          </div>
        </div>
      )}
      {(() => {
        // 세션 → SessionRow 변환 (서버에서 미리 계산해서 클라 테이블에 넘김)
        const rows: SessionRow[] = (sessions ?? []).map((s) => {
          const events = (Array.isArray(s.browser_events) ? s.browser_events : []) as {
            event: string;
            at: string;
            duration_ms?: number;
          }[];
          const exitTotalMs = events.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0);
          const sc = scoreBySession.get(s.id);
          const isSubmitted = !!s.submitted_at;
          const mc = isSubmitted && sc ? sc.mc : null;
          const st = isSubmitted && sc ? sc.st : null;
          const task = isSubmitted && sc && sc.task != null ? sc.task : null;
          const total = isSubmitted && sc ? sc.mc + sc.st + (sc.task ?? 0) : 0;
          return {
            id: s.id,
            name: s.name ?? '(미지정)',
            email: s.email,
            status: s.status,
            startedAtIso: s.started_at,
            submittedAtIso: s.submitted_at,
            progressCurrent: isSubmitted ? totalQ ?? 0 : s.current_order_no ?? 0,
            progressTotal: totalQ ?? 0,
            mcScore: mc,
            stScore: st,
            taskScore: task,
            totalScore: total,
            exitCount: events.length,
            exitTotalMs
          };
        });
        return (
          <SessionsTable
            examId={examId}
            rows={rows}
            sectionMax={{
              mc: sectionMax.multiple_choice,
              st: sectionMax.short_text,
              task: sectionMax.task_based
            }}
            statusLabel={STATUS_LABEL}
            statusTone={STATUS_TONE}
          />
        );
      })()}
    </PageContainer>
  );
}
