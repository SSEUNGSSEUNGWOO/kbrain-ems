'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Icons } from '@/components/icons';
import { resetSelections } from '../_actions';

type Props = {
  cohortId: string;
  disabled?: boolean;
};

export function ResetSelectionButton({ cohortId, disabled }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await resetSelections(cohortId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant='outline' size='sm' disabled={disabled}>
          <Icons.circleX className='mr-1.5' />
          선발 초기화
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>선발 결과 초기화</AlertDialogTitle>
          <AlertDialogDescription>
            이 기수의 모든 신청자 상태를 <strong>신청(applied)</strong>으로 되돌립니다. 선발·탈락·심사중·취하 결정이 모두 사라지고 결정일·탈락 단계도 비워집니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <div className='text-destructive text-sm px-1'>{error}</div>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={pending}
            className='bg-destructive hover:bg-destructive/90 text-white'
          >
            {pending ? '초기화 중...' : '초기화'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
