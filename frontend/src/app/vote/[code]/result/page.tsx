import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { RevealShow } from './_components/reveal-show';

type Props = { params: Promise<{ code: string }> };

export const dynamic = 'force-dynamic';

export default async function VoteResultPage({ params }: Props) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: vote } = await supabase
    .from('presentation_votes')
    .select('id, title, description, status')
    .eq('share_code', code)
    .maybeSingle();
  if (!vote) notFound();

  if (vote.status !== 'closed') {
    return (
      <div className='mx-auto flex min-h-screen max-w-lg items-center justify-center px-4'>
        <div className='rounded-2xl border bg-card px-8 py-12 text-center shadow-sm'>
          <div className='mb-2 text-lg font-semibold'>결과는 아직 공개 전입니다</div>
          <div className='text-muted-foreground text-sm'>
            투표가 마감된 뒤 이 페이지에서 확인하실 수 있어요.
          </div>
        </div>
      </div>
    );
  }

  const [{ data: candidates }, { data: ballots }, { data: items }] = await Promise.all([
    supabase
      .from('presentation_candidates')
      .select('id, order_no, presenter, topic, cover_image_url')
      .eq('vote_id', vote.id)
      .order('order_no'),
    supabase.from('presentation_ballots').select('id').eq('vote_id', vote.id),
    supabase
      .from('presentation_ballot_items')
      .select('candidate_id, presentation_ballots!inner(vote_id)')
      .eq('presentation_ballots.vote_id', vote.id)
  ]);

  const total = ballots?.length ?? 0;
  const tally = new Map<string, number>();
  for (const it of items ?? []) tally.set(it.candidate_id, (tally.get(it.candidate_id) ?? 0) + 1);
  const ranked = (candidates ?? [])
    .map((c) => ({ ...c, votes: tally.get(c.id) ?? 0 }))
    .toSorted((a, b) => b.votes - a.votes || a.order_no - b.order_no);

  return <RevealShow title={vote.title} totalBallots={total} ranked={ranked} />;
}
