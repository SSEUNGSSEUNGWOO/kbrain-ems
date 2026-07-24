'use server';

import { createAdminClient } from '@/lib/supabase/server';

type ActionResult = { error?: string; alreadyVoted?: boolean };

export async function submitBallot(
  code: string,
  input: { candidateIds: string[]; deviceKey: string }
): Promise<ActionResult> {
  const voterName = `익명-${(input.deviceKey || 'anon').slice(0, 6)}`;

  const supabase = createAdminClient();
  const { data: vote } = await supabase
    .from('presentation_votes')
    .select('id, status, max_selections')
    .eq('share_code', code)
    .maybeSingle();
  if (!vote) return { error: '유효하지 않은 링크입니다.' };
  if (vote.status !== 'open') return { error: '아직 투표가 오픈되지 않았거나 마감되었습니다.' };
  if (input.candidateIds.length !== vote.max_selections) {
    return { error: `정확히 ${vote.max_selections}명을 선택해야 합니다.` };
  }
  const uniqueIds = Array.from(new Set(input.candidateIds));
  if (uniqueIds.length !== input.candidateIds.length) {
    return { error: '같은 후보를 중복 선택할 수 없습니다.' };
  }

  const { data: candCheck } = await supabase
    .from('presentation_candidates')
    .select('id')
    .eq('vote_id', vote.id)
    .in('id', uniqueIds);
  if ((candCheck?.length ?? 0) !== uniqueIds.length) {
    return { error: '유효하지 않은 후보가 포함되어 있습니다.' };
  }

  if (input.deviceKey) {
    const { data: dup } = await supabase
      .from('presentation_ballots')
      .select('id')
      .eq('vote_id', vote.id)
      .eq('device_key', input.deviceKey)
      .maybeSingle();
    if (dup) return { alreadyVoted: true };
  }

  const { data: ballot, error: ballotErr } = await supabase
    .from('presentation_ballots')
    .insert({ vote_id: vote.id, voter_name: voterName, device_key: input.deviceKey || null })
    .select('id')
    .single();
  if (ballotErr) return { error: ballotErr.message };

  const items = uniqueIds.map((cid) => ({ ballot_id: ballot.id, candidate_id: cid }));
  const { error: itemErr } = await supabase.from('presentation_ballot_items').insert(items);
  if (itemErr) {
    await supabase.from('presentation_ballots').delete().eq('id', ballot.id);
    return { error: itemErr.message };
  }

  return {};
}
