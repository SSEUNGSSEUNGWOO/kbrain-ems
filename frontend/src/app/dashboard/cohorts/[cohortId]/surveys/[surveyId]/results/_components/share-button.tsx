'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Icons } from '@/components/icons';
import { issueResultsShareCode, revokeResultsShareCode } from '../_actions';

type Props = {
  cohortId: string;
  surveyId: string;
  initialCode: string | null;
};

export function ShareResultsButton({ cohortId, surveyId, initialCode }: Props) {
  const [code, setCode] = useState<string | null>(initialCode);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const publicUrl =
    code && typeof window !== 'undefined'
      ? `${window.location.origin}/survey-results/${code}`
      : code
        ? `/survey-results/${code}`
        : '';

  const onIssue = () => {
    setError(null);
    startTransition(async () => {
      const res = await issueResultsShareCode(cohortId, surveyId);
      if (res.error) setError(res.error);
      else setCode(res.code ?? null);
    });
  };

  const onRevoke = () => {
    if (!confirm('공유 링크를 회수하면 외부에서 결과를 볼 수 없게 됩니다. 회수할까요?')) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeResultsShareCode(cohortId, surveyId);
      if (res.error) setError(res.error);
      else setCode(null);
    });
  };

  const onCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('복사에 실패했습니다. 직접 선택 후 복사하세요.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm' className='print:hidden'>
          <Icons.share className='mr-1.5' />
          공유 링크
          {code && (
            <span className='ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700'>
              ON
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>결과 공유 링크</DialogTitle>
          <DialogDescription>
            발급하면 로그인 없이도 결과 페이지를 볼 수 있는 URL이 생깁니다.
            외부 공유가 끝나면 회수해 비공개로 돌릴 수 있어요.
          </DialogDescription>
        </DialogHeader>

        {code ? (
          <div className='flex flex-col gap-3'>
            <div className='rounded-md border bg-muted/30 px-3 py-2 text-xs break-all'>
              {publicUrl || `/survey-results/${code}`}
            </div>
            <div className='flex gap-2'>
              <Button type='button' onClick={onCopy} className='flex-1'>
                {copied ? '복사됨' : '링크 복사'}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={onRevoke}
                disabled={pending}
              >
                회수
              </Button>
            </div>
            <p className='text-[11px] text-muted-foreground'>
              링크를 받은 누구나 결과를 볼 수 있습니다. 회수 시 즉시 접근 차단됩니다.
            </p>
          </div>
        ) : (
          <div className='flex flex-col gap-3'>
            <p className='text-sm text-muted-foreground'>
              아직 공유 링크가 없습니다. 발급 시 짧은 코드가 생성됩니다.
            </p>
            <Button type='button' onClick={onIssue} disabled={pending}>
              {pending ? '발급 중...' : '공유 링크 발급'}
            </Button>
          </div>
        )}

        {error && <div className='text-destructive text-sm'>{error}</div>}

        <DialogFooter className='sm:justify-end'>
          <Button variant='ghost' size='sm' onClick={() => setOpen(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
