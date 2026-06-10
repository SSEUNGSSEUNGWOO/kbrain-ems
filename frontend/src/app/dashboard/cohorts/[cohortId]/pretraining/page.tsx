import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ChecklistCreateButton } from './_components/checklist-create-button';
import { ChecklistShareControls } from './_components/checklist-share-controls';

type Props = { params: Promise<{ cohortId: string }> };

export default async function PretrainingPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const [{ data: cohort }, { data: checklists }] = await Promise.all([
    supabase.from('cohorts').select('name').eq('id', cohortId).maybeSingle(),
    supabase
      .from('pretraining_checklists')
      .select('id, title, description, share_code, opens_at, closes_at, guide_url')
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false })
  ]);

  const rows = checklists ?? [];

  const responseCounts = new Map<string, { total: number; submitted: number }>();
  if (rows.length > 0) {
    const { data: responses } = await supabase
      .from('pretraining_checklist_responses')
      .select('checklist_id, submitted_at')
      .in(
        'checklist_id',
        rows.map((c) => c.id)
      );
    for (const r of responses ?? []) {
      const cur = responseCounts.get(r.checklist_id) ?? { total: 0, submitted: 0 };
      cur.total++;
      if (r.submitted_at) cur.submitted++;
      responseCounts.set(r.checklist_id, cur);
    }
  }

  return (
    <PageContainer
      pageTitle='사전 세팅 체크리스트'
      pageDescription={cohort?.name ?? ''}
      pageHeaderAction={<ChecklistCreateButton cohortId={cohortId} />}
    >
      {rows.length === 0 ? (
        <Card>
          <CardContent className='text-muted-foreground py-12 text-center'>
            등록된 체크리스트가 없습니다. 우측 상단에서 새로 생성하세요.
          </CardContent>
        </Card>
      ) : (
        <div className='flex flex-col gap-4'>
          {rows.map((c) => {
            const counts = responseCounts.get(c.id) ?? { total: 0, submitted: 0 };
            const published = !!c.share_code;
            return (
              <Card key={c.id}>
                <CardContent className='flex flex-wrap items-start justify-between gap-4 px-6 py-5'>
                  <div className='flex flex-col gap-1.5'>
                    <div className='flex items-center gap-2'>
                      <h2 className='text-lg font-semibold'>{c.title}</h2>
                      <Badge
                        variant='outline'
                        className={
                          published
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-slate-300 bg-slate-50 text-slate-600'
                        }
                      >
                        {published ? '공유 중' : '미발행'}
                      </Badge>
                    </div>
                    {c.description && (
                      <p className='text-muted-foreground text-sm'>{c.description}</p>
                    )}
                    <div className='text-muted-foreground text-xs'>
                      응답 <span className='text-foreground font-semibold'>{counts.submitted}</span>건 제출
                      {counts.total > counts.submitted && <span> · 미제출 {counts.total - counts.submitted}건</span>}
                    </div>
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Button variant='outline' size='sm' asChild>
                      <Link href={`/dashboard/cohorts/${cohortId}/pretraining/${c.id}`}>
                        편집
                      </Link>
                    </Button>
                    <Button variant='outline' size='sm' asChild>
                      <Link href={`/dashboard/cohorts/${cohortId}/pretraining/${c.id}/responses`}>
                        응답
                      </Link>
                    </Button>
                    <ChecklistShareControls
                      cohortId={cohortId}
                      checklistId={c.id}
                      initialCode={c.share_code}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
