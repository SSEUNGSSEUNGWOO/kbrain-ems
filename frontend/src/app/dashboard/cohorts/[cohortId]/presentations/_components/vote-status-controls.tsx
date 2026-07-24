'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setVoteStatus, deleteVote } from '../_actions';

type Props = {
  cohortId: string;
  voteId: string;
  status: 'draft' | 'open' | 'closed';
  candidateCount: number;
};

export function VoteStatusControls({ cohortId, voteId, status, candidateCount }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSet = (next: 'draft' | 'open' | 'closed') => {
    if (next === 'open' && candidateCount < 3) {
      alert('후보를 3명 이상 등록해야 오픈할 수 있습니다.');
      return;
    }
    startTransition(async () => {
      const res = await setVoteStatus(cohortId, voteId, next);
      if (res.error) alert(res.error);
      else router.refresh();
    });
  };

  const onDelete = () => {
    if (!confirm('삭제하면 응답도 모두 삭제됩니다. 진행할까요?')) return;
    startTransition(async () => {
      const res = await deleteVote(cohortId, voteId);
      if (res.error) alert(res.error);
      else router.refresh();
    });
  };

  return (
    <div className='flex flex-wrap items-center gap-2'>
      {status !== 'open' && (
        <Button size='sm' onClick={() => onSet('open')} disabled={pending}>
          투표 오픈
        </Button>
      )}
      {status === 'open' && (
        <Button size='sm' variant='outline' onClick={() => onSet('closed')} disabled={pending}>
          투표 마감
        </Button>
      )}
      {status === 'closed' && (
        <Button size='sm' variant='ghost' onClick={() => onSet('draft')} disabled={pending}>
          초안으로 되돌리기
        </Button>
      )}
      <Button
        size='sm'
        variant='ghost'
        className='text-destructive'
        onClick={onDelete}
        disabled={pending}
      >
        삭제
      </Button>
    </div>
  );
}
