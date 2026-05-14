'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DispatchMaterialDialog } from './dispatch-material-dialog';
import type { DispatchTemplate } from '@/lib/dispatch-stages';

type Props = {
  cohortId: string;
  templates: DispatchTemplate[];
  stageLabel: string;
};

export function DispatchMaterialTrigger({ cohortId, templates, stageLabel }: Props) {
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
        templates={templates}
        stageLabel={stageLabel}
      />
    </>
  );
}
