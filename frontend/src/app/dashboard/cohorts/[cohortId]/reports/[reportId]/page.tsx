import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SectionCard } from '@/components/report/section-card';
import { createAdminClient } from '@/lib/supabase/server';
import type { ReportSection } from '@/lib/reports/generate-session';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Props = { params: Promise<{ cohortId: string; reportId: string }> };

type ReportContent = {
  model?: string;
  sections?: ReportSection[];
  source_data?: unknown;
};

export default async function ReportDetailPage({ params }: Props) {
  const { cohortId, reportId } = await params;
  const supabase = createAdminClient();

  const { data: report } = await supabase
    .from('cohort_reports')
    .select('id, title, status, draft_at, content, cohort_id, session_id, cohorts(name)')
    .eq('id', reportId)
    .eq('cohort_id', cohortId)
    .maybeSingle();

  if (!report) notFound();

  const content = (report.content ?? {}) as ReportContent;
  const sections = content.sections ?? [];
  const cohortName = (report as unknown as { cohorts: { name: string } | null }).cohorts?.name ?? '';

  return (
    <PageContainer
      pageTitle={report.title ?? '결과보고서'}
      pageDescription={`${cohortName}${content.model ? ` · ${content.model}` : ''}${report.draft_at ? ` · ${report.draft_at.slice(0, 10)}` : ''}`}
      pageHeaderAction={
        <Button variant='outline' size='sm' asChild>
          <Link href={`/dashboard/cohorts/${cohortId}/reports`}>← 회차 목록</Link>
        </Button>
      }
    >
      <div className='flex flex-col gap-4'>
        {sections.length === 0 ? (
          <Card>
            <CardContent className='text-muted-foreground py-12 text-center'>
              생성된 섹션이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className='py-3'>
                <p className='text-muted-foreground text-xs'>
                  각 섹션의 <span className='font-medium'>섹션 전체 복사</span> 버튼을 누르면 본문과 표가 함께 클립보드에 들어갑니다. 표가 별도로 필요하면 표 아래의{' '}
                  <span className='font-medium'>이 표만 복사</span>를 사용하세요. 한글 워드프로세서에 붙여넣으면 표는 자동으로 인식됩니다.
                </p>
              </CardContent>
            </Card>
            {sections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </>
        )}
      </div>
    </PageContainer>
  );
}
