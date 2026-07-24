import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { VoteForm } from './_components/vote-form';

type Props = { params: Promise<{ code: string }> };

export const dynamic = 'force-dynamic';

export default async function PublicVotePage({ params }: Props) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: vote } = await supabase
    .from('presentation_votes')
    .select('id, title, description, status, max_selections')
    .eq('share_code', code)
    .maybeSingle();
  if (!vote) notFound();

  if (vote.status === 'draft') {
    return (
      <div className='mx-auto max-w-lg rounded-xl border bg-card px-6 py-12 text-center'>
        <div className='mb-2 text-lg font-semibold'>아직 투표가 시작되지 않았습니다</div>
        <div className='text-muted-foreground text-sm'>
          운영자가 오픈하면 이 페이지에서 투표하실 수 있어요.
        </div>
      </div>
    );
  }
  if (vote.status === 'closed') {
    return (
      <div className='mx-auto max-w-lg rounded-xl border bg-card px-6 py-12 text-center'>
        <div className='mb-2 text-lg font-semibold'>투표가 마감되었습니다</div>
        <div className='text-muted-foreground text-sm'>결과는 곧 공개됩니다.</div>
      </div>
    );
  }

  const { data: candidates } = await supabase
    .from('presentation_candidates')
    .select('id, order_no, presenter, topic, cover_image_url')
    .eq('vote_id', vote.id)
    .order('order_no');

  return (
    <VoteForm
      code={code}
      title={vote.title}
      description={vote.description}
      maxSelections={vote.max_selections}
      candidates={candidates ?? []}
    />
  );
}
