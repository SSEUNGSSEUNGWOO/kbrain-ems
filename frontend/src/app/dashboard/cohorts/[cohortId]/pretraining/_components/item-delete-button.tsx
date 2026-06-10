'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { deleteItem } from '../_actions';

type Props = {
  cohortId: string;
  checklistId: string;
  itemId: string;
};

export function ItemDeleteButton({ cohortId, checklistId, itemId }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = () => {
    if (!confirm('이 항목을 삭제할까요?')) return;
    startTransition(async () => {
      await deleteItem(cohortId, checklistId, itemId);
      router.refresh();
    });
  };

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      className='h-7 w-7'
      onClick={onClick}
      disabled={pending}
      aria-label='항목 삭제'
    >
      <Icons.trash className='h-3.5 w-3.5' />
    </Button>
  );
}
