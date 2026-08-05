'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { generateSummaryAction } from '../_actions';

export function GenerateSummaryButton({
  cohortId,
  surveyId,
  hasSummary
}: {
  cohortId: string;
  surveyId: string;
  hasSummary: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const res = await generateSummaryAction(cohortId, surveyId);
      if (res.error) toast.error(res.error);
      else toast.success('요약이 생성되었습니다.');
    });

  return (
    <Button variant={hasSummary ? 'outline' : 'default'} size='sm' onClick={run} disabled={pending}>
      {pending ? (
        <>
          <Icons.spinner className='mr-1 h-4 w-4 animate-spin' />
          생성 중…
        </>
      ) : hasSummary ? (
        '요약 재생성'
      ) : (
        'AI 요약 생성'
      )}
    </Button>
  );
}
