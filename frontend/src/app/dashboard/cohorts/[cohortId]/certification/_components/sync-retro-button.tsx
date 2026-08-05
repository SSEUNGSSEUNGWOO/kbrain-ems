'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { syncRetroactiveCertifications } from '../_actions';

export function SyncRetroButton({ cohortId }: { cohortId: string }) {
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const res = await syncRetroactiveCertifications(cohortId);
      if (res.error) toast.error(res.error);
      else if ((res.inserted ?? 0) === 0 && (res.updated ?? 0) === 0)
        toast.info('반영할 응시 결과가 아직 없습니다.');
      else
        toast.success(
          `원 과정 반영 완료 — 수료 요건 충족 ${res.inserted}건, 인증 갱신 ${res.updated}건`
        );
    });

  return (
    <Button size='sm' variant='outline' onClick={run} disabled={pending}>
      {pending ? (
        <>
          <Icons.spinner className='mr-1 h-4 w-4 animate-spin' />
          반영 중…
        </>
      ) : (
        '원 과정에 반영'
      )}
    </Button>
  );
}
