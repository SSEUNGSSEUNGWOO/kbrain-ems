'use server';

import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type ActionResult = { error?: string };

function generateShareCode(): string {
  return randomBytes(4).toString('base64url');
}

export async function createVote(
  cohortId: string,
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: '제목은 필수입니다.' };

  const supabase = createAdminClient();

  for (let i = 0; i < 5; i++) {
    const code = generateShareCode();
    const { data, error } = await supabase
      .from('presentation_votes')
      .insert({
        cohort_id: cohortId,
        title,
        description: String(formData.get('description') ?? '').trim() || null,
        share_code: code
      })
      .select('id')
      .single();
    if (!error) {
      revalidatePath(`/dashboard/cohorts/${cohortId}/presentations`);
      return { id: data.id };
    }
    if (!/unique|duplicate/i.test(error.message)) {
      return { error: error.message };
    }
  }
  return { error: '공유 코드 발급에 실패했습니다.' };
}

export async function setVoteStatus(
  cohortId: string,
  voteId: string,
  status: 'draft' | 'open' | 'closed'
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('presentation_votes')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', voteId)
    .eq('cohort_id', cohortId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/cohorts/${cohortId}/presentations`);
  revalidatePath(`/dashboard/cohorts/${cohortId}/presentations/${voteId}`);
  return {};
}

export async function deleteVote(cohortId: string, voteId: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('presentation_votes')
    .delete()
    .eq('id', voteId)
    .eq('cohort_id', cohortId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/cohorts/${cohortId}/presentations`);
  return {};
}

type CandidateInput = {
  order_no: number;
  presenter: string;
  topic?: string | null;
  cover_image_url?: string | null;
};

export async function replaceCandidates(
  cohortId: string,
  voteId: string,
  candidates: CandidateInput[]
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error: delErr } = await supabase
    .from('presentation_candidates')
    .delete()
    .eq('vote_id', voteId);
  if (delErr) return { error: delErr.message };

  if (candidates.length === 0) {
    revalidatePath(`/dashboard/cohorts/${cohortId}/presentations/${voteId}`);
    return {};
  }

  const rows = candidates.map((c) => ({
    vote_id: voteId,
    order_no: c.order_no,
    presenter: c.presenter,
    topic: c.topic ?? null,
    cover_image_url: c.cover_image_url ?? null
  }));

  const { error: insErr } = await supabase.from('presentation_candidates').insert(rows);
  if (insErr) return { error: insErr.message };

  revalidatePath(`/dashboard/cohorts/${cohortId}/presentations/${voteId}`);
  return {};
}
