import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ voteId: string }> };

export async function GET(_req: Request, { params }: Props) {
  const { voteId } = await params;
  const supabase = createAdminClient();

  const [{ data: candidates }, { data: ballots }, { data: items }] = await Promise.all([
    supabase
      .from('presentation_candidates')
      .select('id, order_no, presenter, topic, cover_image_url')
      .eq('vote_id', voteId)
      .order('order_no'),
    supabase
      .from('presentation_ballots')
      .select('id, voter_name, submitted_at')
      .eq('vote_id', voteId),
    supabase
      .from('presentation_ballot_items')
      .select('candidate_id, ballot_id, presentation_ballots!inner(vote_id)')
      .eq('presentation_ballots.vote_id', voteId)
  ]);

  const votesByCandidate = new Map<string, number>();
  for (const it of items ?? []) {
    votesByCandidate.set(it.candidate_id, (votesByCandidate.get(it.candidate_id) ?? 0) + 1);
  }

  const totalBallots = ballots?.length ?? 0;
  const results = (candidates ?? []).map((c) => ({
    id: c.id,
    order_no: c.order_no,
    presenter: c.presenter,
    topic: c.topic,
    cover_image_url: c.cover_image_url,
    votes: votesByCandidate.get(c.id) ?? 0
  }));
  results.sort((a, b) => b.votes - a.votes || a.order_no - b.order_no);

  return NextResponse.json({
    totalBallots,
    voters: (ballots ?? [])
      .toSorted((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1))
      .map((b) => ({ name: b.voter_name, at: b.submitted_at })),
    results
  });
}
