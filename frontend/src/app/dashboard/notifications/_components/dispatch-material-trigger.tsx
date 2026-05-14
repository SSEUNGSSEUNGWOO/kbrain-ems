'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DispatchMaterialDialog } from './dispatch-material-dialog';
import type { DispatchTemplate } from '@/lib/dispatch-stages';

type Props = {
  cohortId: string;
  template: DispatchTemplate;
  stageLabel: string;
};

export function DispatchMaterialTrigger({ cohortId, template, stageLabel }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
        발송 자료
      </Button>
      <DispatchMaterialDialog
        open={open}
        onOpenChange={setOpen}
        cohortId={cohortId}
        template={template}
        stageLabel={stageLabel}
      />
    </>
  );
}
