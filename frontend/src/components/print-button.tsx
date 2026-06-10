'use client';

import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

type Props = {
  label?: string;
};

export function PrintButton({ label = 'PDF로 저장 (인쇄)' }: Props) {
  return (
    <Button
      type='button'
      size='sm'
      variant='outline'
      onClick={() => window.print()}
      className='print:hidden'
    >
      <Icons.download className='mr-1.5' />
      {label}
    </Button>
  );
}
