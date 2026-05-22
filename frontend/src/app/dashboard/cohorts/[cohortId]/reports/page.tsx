import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { GenerateReportButton } from './_components/generate-button';

type Props = { params: Promise<{ cohortId: string }> };

type SessionRow = {
  id: string;
  session_date: string | null;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
};

type ReportRow = {
  id: string;
  session_id: string | null;
  status: string;
  draft_at: string | null;
  created_at: string;
};

export default async function ReportsPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const [{ data: cohort }, { data: sessions }, { data: reports }] = await Promise.all([
    supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle(),
    supabase
      .from('sessions')
      .select('id, session_date, title, start_time, end_time')
      .eq('cohort_id', cohortId)
      .order('session_date', { ascending: true })
      .returns<SessionRow[]>(),
    supabase
      .from('cohort_reports')
      .select('id, session_id, status, draft_at, created_at')
      .eq('cohort_id', cohortId)
      .eq('type', 'session')
      .order('created_at', { ascending: false })
      .returns<ReportRow[]>()
  ]);

  // 회차별 최신 보고서 매핑
  const latestBySession = new Map<string, ReportRow>();
  for (const r of reports ?? []) {
    if (!r.session_id) continue;
    if (!latestBySession.has(r.session_id)) latestBySession.set(r.session_id, r);
  }

  const rows = (sessions ?? []).map((s, idx) => ({
    ...s,
    no: idx + 1,
    report: latestBySession.get(s.id) ?? null
  }));

  return (
    <PageContainer
      pageTitle='회차별 결과보고서'
      pageDescription={cohort?.name ?? ''}
    >
      {rows.length === 0 ? (
        <Card>
          <CardContent className='text-muted-foreground py-12 text-center'>
            등록된 회차가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='p-0'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50'>
                <tr>
                  <th className='border-b px-4 py-3 text-left font-medium'>회차</th>
                  <th className='border-b px-4 py-3 text-left font-medium'>일자</th>
                  <th className='border-b px-4 py-3 text-left font-medium'>주제</th>
                  <th className='border-b px-4 py-3 text-left font-medium'>시간</th>
                  <th className='border-b px-4 py-3 text-left font-medium'>보고서</th>
                  <th className='border-b px-4 py-3 text-right font-medium'>액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className='even:bg-muted/10'>
                    <td className='border-b px-4 py-3 font-medium tabular-nums'>{s.no}회차</td>
                    <td className='text-muted-foreground border-b px-4 py-3 tabular-nums'>
                      {s.session_date ?? '-'}
                    </td>
                    <td className='border-b px-4 py-3'>{s.title ?? '-'}</td>
                    <td className='text-muted-foreground border-b px-4 py-3 tabular-nums'>
                      {s.start_time && s.end_time ? `${s.start_time} ~ ${s.end_time}` : '-'}
                    </td>
                    <td className='border-b px-4 py-3'>
                      {s.report ? (
                        <Badge variant='outline' className='font-normal'>
                          {s.report.status === 'draft' ? '초안' : s.report.status}
                          {s.report.draft_at && (
                            <span className='ml-1 opacity-60'>· {s.report.draft_at.slice(0, 10)}</span>
                          )}
                        </Badge>
                      ) : (
                        <span className='text-muted-foreground'>미생성</span>
                      )}
                    </td>
                    <td className='border-b px-4 py-3 text-right'>
                      <div className='flex items-center justify-end gap-2'>
                        {s.report && (
                          <Button variant='outline' size='sm' asChild>
                            <Link href={`/dashboard/cohorts/${cohortId}/reports/${s.report.id}`}>
                              보기
                            </Link>
                          </Button>
                        )}
                        <GenerateReportButton
                          sessionId={s.id}
                          cohortId={cohortId}
                          label={s.report ? '재생성' : '보고서 생성'}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
