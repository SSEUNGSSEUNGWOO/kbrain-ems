'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Icons } from '@/components/icons';

type Props = {
  cohortId: string;
  disabled: boolean;
};

export function SelectionExportButton({ cohortId, disabled }: Props) {
  const [includeCancel, setIncludeCancel] = useState(false);
  const url = includeCancel
    ? `/api/cohorts/${cohortId}/applications/export?includeCancel=1`
    : `/api/cohorts/${cohortId}/applications/export`;
  return (
    <div className='flex items-center gap-2'>
      <Button variant='outline' size='sm' asChild disabled={disabled}>
        <a href={url}>
          <Icons.download className='mr-1.5' />
          선발결과 엑셀
        </a>
      </Button>
      <label className='flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground'>
        <Checkbox checked={includeCancel} onCheckedChange={(v) => setIncludeCancel(v === true)} />
        당일취소자 포함
      </label>
    </div>
  );
}
