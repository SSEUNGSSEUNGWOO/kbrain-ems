import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';
import { isMultipleChoiceCorrect, isShortAnswerCorrect } from '@/lib/exam-grading';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ShareLinkCopy } from './_components/share-link-copy';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ examId: string }> };

function formatSecFromMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs === 0 ? `${m}분` : `${m}분 ${rs}초`;
}

// 서버가 Vercel(UTC)에서 렌더되므로 명시적으로 KST 지정 필요.
// dateStyle/timeStyle 'short'로 컴팩트하게: "26. 7. 9. 오전 10:39"
function formatKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

// 응시자 관점에서 '제출'과 '채점완료'는 헷갈리기만 함.
// 채점 완료 여부는 점수 컬럼(total_score vs auto_score)이 이미 명확히 표시하므로
// 뱃지는 '진행중' vs '제출완료' 이분으로 단순화.
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
      <div className='rounded-lg border overflow-x-auto'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>응시자</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className='text-right'>진행</TableHead>
              <TableHead className='text-right' title={`객관식 만점 ${sectionMax.multiple_choice}점`}>
                객관식
              </TableHead>
              <TableHead className='text-right' title={`단답형 만점 ${sectionMax.short_text}점`}>
                단답형
              </TableHead>
              <TableHead className='text-right' title={`작업형 만점 ${sectionMax.task_based}점`}>
                작업형
              </TableHead>
              <TableHead className='text-right'>총점</TableHead>
              <TableHead className='text-right'>이탈</TableHead>
              <TableHead>시작</TableHead>
              <TableHead>제출</TableHead>
              <TableHead className='w-12'></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sessions ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className='text-muted-foreground py-10 text-center text-sm'>
                  아직 발급된 응시자 세션이 없습니다.
                </TableCell>
              </TableRow>
            )}
            {(sessions ?? []).map((s) => {
              const events = (Array.isArray(s.browser_events) ? s.browser_events : []) as {
                event: string;
                at: string;
                duration_ms?: number;
              }[];
              const exitTotalMs = events.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0);
              const progress = s.submitted_at
                ? `${totalQ ?? 0}/${totalQ ?? 0}`
                : s.current_order_no
                  ? `${s.current_order_no}/${totalQ ?? 0}`
                  : '-';
              const sc = scoreBySession.get(s.id);
              const isSubmitted = !!s.submitted_at;
              // 각 섹션 셀: 제출 후에만 점수 표시. 작업형은 채점 대기면 '대기'.
              const mcCell = isSubmitted && sc ? `${sc.mc}/${sectionMax.multiple_choice}` : '-';
              const stCell = isSubmitted && sc ? `${sc.st}/${sectionMax.short_text}` : '-';
              const taskCell = !isSubmitted || !sc
                ? '-'
                : sc.task != null
                  ? `${sc.task}/${sectionMax.task_based}`
                  : sc.taskHasResponse
                    ? '대기'
                    : `0/${sectionMax.task_based}`;
              const totalMax = sectionMax.multiple_choice + sectionMax.short_text + sectionMax.task_based;
              // 총점은 항상 지금까지 채점된 합계. 작업형 수동채점 대기 중이면 task=0으로 취급되어
              // '자동채점만 반영된 임시 합계'가 표시됨 (관리자가 채점 진행할수록 자연스럽게 상승).
              const totalCell = !isSubmitted || !sc
                ? '-'
                : `${sc.mc + sc.st + (sc.task ?? 0)}/${totalMax}`;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className='font-medium'>{s.name ?? '(미지정)'}</div>
                    {s.email && <div className='text-muted-foreground text-xs'>{s.email}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline' className={STATUS_TONE[s.status] ?? ''}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{progress}</TableCell>
                  <TableCell className='text-right tabular-nums'>{mcCell}</TableCell>
                  <TableCell className='text-right tabular-nums'>{stCell}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {taskCell === '대기' ? (
                      <span className='text-amber-700 font-medium'>대기</span>
                    ) : (
                      taskCell
                    )}
                  </TableCell>
                  <TableCell className='text-right tabular-nums font-semibold'>{totalCell}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {events.length > 0 ? (
                      <span className='text-amber-700 font-medium'>
                        {events.length}회
                        {exitTotalMs > 0 && (
                          <span className='ml-1 text-xs opacity-80'>· {formatSecFromMs(exitTotalMs)}</span>
                        )}
                      </span>
                    ) : (
                      <span className='text-muted-foreground'>-</span>
                    )}
                  </TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    {s.started_at ? formatKst(s.started_at) : '-'}
                  </TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    {s.submitted_at ? formatKst(s.submitted_at) : '-'}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Link
                      href={`/dashboard/exams/${examId}/sessions/${s.id}`}
                      className='text-xs text-blue-600 hover:underline'
                    >
                      상세
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </PageContainer>
  );
}
