'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { generateSessionReportAction } from '../_actions';

type Props = {
  sessionId: string;
  cohortId: string;
  label?: string;
};

export function GenerateReportButton({ sessionId, cohortId, label = '보고서 생성' }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateSessionReportAction(sessionId, cohortId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/cohorts/${cohortId}/reports/${result.reportId}`);
      router.refresh();
    });
  }

  return (
    <div className='flex flex-col items-end gap-1'>
      <Button size='sm' onClick={onClick} disabled={pending}>
        {pending ? '생성 중…' : label}
      </Button>
      {error && <span className='text-destructive text-xs'>{error}</span>}
    </div>
  );
}
