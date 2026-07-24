import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { VoteCreateButton } from './_components/vote-create-button';

type Props = { params: Promise<{ cohortId: string }> };

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  draft: { text: '준비 중', className: 'border-slate-300 bg-slate-50 text-slate-600' },
  open: { text: '투표 오픈', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  closed: { text: '마감', className: 'border-amber-300 bg-amber-50 text-amber-700' }
};

export default async function PresentationVotesPage({ params }: Props) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const [{ data: cohort }, { data: votes }] = await Promise.all([
    supabase.from('cohorts').select('name').eq('id', cohortId).maybeSingle(),
    supabase
      .from('presentation_votes')
      .select('id, title, description, status, share_code, created_at')
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false })
  ]);

  const rows = votes ?? [];

  const counts = new Map<string, { candidates: number; ballots: number }>();
  if (rows.length > 0) {
    const ids = rows.map((v) => v.id);
    const [{ data: cand }, { data: ballots }] = await Promise.all([
      supabase.from('presentation_candidates').select('vote_id').in('vote_id', ids),
      supabase.from('presentation_ballots').select('vote_id').in('vote_id', ids)
    ]);
    for (const c of cand ?? []) {
      const cur = counts.get(c.vote_id) ?? { candidates: 0, ballots: 0 };
      cur.candidates++;
      counts.set(c.vote_id, cur);
    }
    for (const b of ballots ?? []) {
      const cur = counts.get(b.vote_id) ?? { candidates: 0, ballots: 0 };
      cur.ballots++;
      counts.set(b.vote_id, cur);
    }
  }

  return (
    <PageContainer
      pageTitle='발표 투표'
      pageDescription={cohort?.name ?? ''}
      pageHeaderAction={<VoteCreateButton cohortId={cohortId} />}
    >
      {rows.length === 0 ? (
        <Card>
          <CardContent className='text-muted-foreground py-12 text-center'>
            등록된 투표가 없습니다. 우측 상단에서 새로 생성하세요.
          </CardContent>
        </Card>
      ) : (
        <div className='flex flex-col gap-4'>
          {rows.map((v) => {
            const c = counts.get(v.id) ?? { candidates: 0, ballots: 0 };
            const label = STATUS_LABEL[v.status] ?? STATUS_LABEL.draft;
            return (
              <Card key={v.id}>
                <CardContent className='flex flex-wrap items-start justify-between gap-4 px-6 py-5'>
                  <div className='flex flex-col gap-1.5'>
                    <div className='flex items-center gap-2'>
                      <h2 className='text-lg font-semibold'>{v.title}</h2>
                      <Badge variant='outline' className={label.className}>
                        {label.text}
                      </Badge>
                    </div>
                    {v.description && (
                      <p className='text-muted-foreground text-sm'>{v.description}</p>
                    )}
                    <div className='text-muted-foreground text-xs'>
                      후보 <span className='text-foreground font-semibold'>{c.candidates}</span>명 ·
                      응답 <span className='text-foreground font-semibold'>{c.ballots}</span>건
                    </div>
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Button variant='outline' size='sm' asChild>
                      <Link href={`/dashboard/cohorts/${cohortId}/presentations/${v.id}`}>
                        관리
                      </Link>
                    </Button>
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
