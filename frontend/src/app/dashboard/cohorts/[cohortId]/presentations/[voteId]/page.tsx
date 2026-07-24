import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import QRCode from 'qrcode';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createAdminClient } from '@/lib/supabase/server';
import { VoteStatusControls } from '../_components/vote-status-controls';
import { CandidateEditor } from './_components/candidate-editor';
import { QrShare } from './_components/qr-share';
import { LiveResults } from './_components/live-results';

type Props = { params: Promise<{ cohortId: string; voteId: string }> };

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  draft: { text: '준비 중', className: 'border-slate-300 bg-slate-50 text-slate-600' },
  open: { text: '투표 오픈', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  closed: { text: '마감', className: 'border-amber-300 bg-amber-50 text-amber-700' }
};

export default async function PresentationVoteDetailPage({ params }: Props) {
  const { cohortId, voteId } = await params;
  const supabase = createAdminClient();

  const [{ data: vote }, { data: candidates }] = await Promise.all([
    supabase
      .from('presentation_votes')
      .select('id, cohort_id, title, description, status, share_code, max_selections')
      .eq('id', voteId)
      .eq('cohort_id', cohortId)
      .maybeSingle(),
    supabase
      .from('presentation_candidates')
      .select('order_no, presenter, topic, cover_image_url')
      .eq('vote_id', voteId)
      .order('order_no')
  ]);

  if (!vote) notFound();

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3100';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const publicUrl = `${proto}://${host}/vote/${vote.share_code}`;
  const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 512, margin: 1 });

  const label = STATUS_LABEL[vote.status] ?? STATUS_LABEL.draft;
  const initialCandidates = (candidates ?? []).map((c) => ({
    order_no: c.order_no,
    presenter: c.presenter,
    topic: c.topic,
    cover_image_url: c.cover_image_url
  }));

  return (
    <PageContainer
      pageTitle={vote.title}
      pageDescription={vote.description ?? ''}
      pageHeaderAction={
        <Button variant='outline' size='sm' asChild>
          <Link href={`/dashboard/cohorts/${cohortId}/presentations`}>목록</Link>
        </Button>
      }
    >
      <div className='flex flex-col gap-6'>
        <Card>
          <CardContent className='flex flex-wrap items-start justify-between gap-6 px-6 py-5'>
            <div className='flex flex-col gap-2'>
              <div className='flex items-center gap-2'>
                <Badge variant='outline' className={label.className}>
                  {label.text}
                </Badge>
                <div className='text-muted-foreground text-sm'>
                  정확히 {vote.max_selections}명 선택 · 후보 {initialCandidates.length}명
                </div>
              </div>
              <VoteStatusControls
                cohortId={cohortId}
                voteId={vote.id}
                status={vote.status}
                candidateCount={initialCandidates.length}
              />
            </div>
            <QrShare url={publicUrl} qrDataUrl={qrDataUrl} />
          </CardContent>
        </Card>

        {initialCandidates.length > 0 && (
          <Card>
            <CardContent className='flex flex-col gap-3 px-6 py-5'>
              <h3 className='text-base font-semibold'>후보 미리보기</h3>
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
                {initialCandidates.map((c) => (
                  <div key={c.order_no} className='flex flex-col gap-1.5'>
                    <div className='bg-muted relative aspect-video overflow-hidden rounded border'>
                      {c.cover_image_url ? (
                        <Image
                          src={c.cover_image_url}
                          alt={c.presenter}
                          fill
                          className='object-cover'
                          sizes='240px'
                          unoptimized
                        />
                      ) : (
                        <div className='text-muted-foreground flex h-full items-center justify-center text-xs'>
                          표지 없음
                        </div>
                      )}
                    </div>
                    <div className='text-xs font-medium'>
                      {c.order_no}. {c.presenter}
                    </div>
                    {c.topic && (
                      <div className='text-muted-foreground line-clamp-2 text-xs'>{c.topic}</div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <CandidateEditor cohortId={cohortId} voteId={vote.id} initial={initialCandidates} />

        <LiveResults voteId={vote.id} isOpen={vote.status === 'open'} />
      </div>
    </PageContainer>
  );
}
