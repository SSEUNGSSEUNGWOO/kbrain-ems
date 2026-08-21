'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { DispatchTemplate } from '@/lib/dispatch-stages';

import { AutoDispatchDialog } from './auto-dispatch-dialog';

type Props = {
  cohortId: string;
  templates: DispatchTemplate[];
  stageLabel: string;
};

export function AutoDispatchTrigger({ cohortId, templates, stageLabel }: Props) {
  const [open, setOpen] = useState(false);
  // 통합 발송 그룹이라도 자동 발송은 단계 하나를 기준으로 이력을 남긴다.
  const template = templates[0];
  if (!template) return null;

  return (
    <>
      <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
        자동 발송
      </Button>
      <AutoDispatchDialog
        open={open}
        onOpenChange={setOpen}
        cohortId={cohortId}
        template={template}
        stageLabel={stageLabel}
      />
    </>
  );
}
