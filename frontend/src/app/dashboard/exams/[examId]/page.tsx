import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { isDeveloper } from '@/lib/auth';
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

const STATUS_LABEL: Record<string, string> = {
  in_progress: '진행중',
  submitted: '제출',
  graded: '채점완료'
};
const STATUS_TONE: Record<string, string> = {
  in_progress: 'bg-slate-100 text-slate-700 border-slate-300',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
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
              <TableHead className='text-right'>점수</TableHead>
              <TableHead className='text-right'>이탈</TableHead>
              <TableHead>시작</TableHead>
              <TableHead>제출</TableHead>
              <TableHead className='w-12'></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sessions ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className='text-muted-foreground py-10 text-center text-sm'>
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
              const score =
                s.total_score != null
                  ? `${s.total_score}`
                  : s.auto_score != null
                    ? `자동 ${s.auto_score}`
                    : '-';
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
                  <TableCell className='text-right tabular-nums font-medium'>{score}</TableCell>
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
                    {s.started_at ? new Date(s.started_at).toLocaleString('ko-KR') : '-'}
                  </TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    {s.submitted_at ? new Date(s.submitted_at).toLocaleString('ko-KR') : '-'}
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
