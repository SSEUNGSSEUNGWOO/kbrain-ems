'use client';

import { useState, useTransition } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { STAGE_CATALOG } from '@/lib/dispatch-stages';
import { toggleStageEnabled } from '@/app/dashboard/notifications/_actions';

type Props = {
  cohortId: string;
  enabledMap: Record<string, boolean>; // row 없는 단계는 키 없음 = 기본 true
};

const TRIGGER_LABEL: Record<string, string> = {
  decided_at: '선발 결정일 기준',
  started_at: '개강일 기준',
  ended_at: '종강일 기준'
};

export function StageToggleList({ cohortId, enabledMap }: Props) {
  const [localMap, setLocalMap] = useState<Record<string, boolean>>(enabledMap);
  const [pending, start] = useTransition();

  const isEnabled = (code: string): boolean => localMap[code] !== false;

  const onToggle = (code: string, currentlyEnabled: boolean) => {
    const next = !currentlyEnabled;
    setLocalMap((prev) => ({ ...prev, [code]: next }));
    start(async () => {
      const res = await toggleStageEnabled(cohortId, code as never, next);
      if (!res.ok) {
        toast.error(res.error);
        // 롤백
        setLocalMap((prev) => ({ ...prev, [code]: currentlyEnabled }));
      }
    });
  };

  return (
    <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
      {STAGE_CATALOG.map((s) => {
        const enabled = isEnabled(s.code);
        return (
          <label
            key={s.code}
            className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 transition ${
              enabled ? 'border-blue-200 bg-blue-50/30' : 'border-muted bg-muted/20 opacity-60'
            }`}
          >
            <Checkbox
              checked={enabled}
              disabled={pending}
              onCheckedChange={() => onToggle(s.code, enabled)}
              className='mt-0.5'
            />
            <div className='flex-1'>
              <div className='text-sm font-medium'>{s.label}</div>
              <div className='text-muted-foreground text-xs'>{s.hint}</div>
              <div className='text-muted-foreground mt-0.5 text-[10px]'>
                {TRIGGER_LABEL[s.triggerColumn]} {s.offsetDays >= 0 ? '+' : ''}
                {s.offsetDays}일
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
