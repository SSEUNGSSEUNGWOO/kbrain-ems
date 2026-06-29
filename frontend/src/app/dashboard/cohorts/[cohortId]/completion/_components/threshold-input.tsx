'use client';

import { useEffect, useState, useTransition } from 'react';
import { parseAsInteger, useQueryStates } from 'nuqs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { saveMinAttendance } from '../_actions';

type Props = {
  cohortId: string;
  defaultMin: number;
  savedMin: number | null;
  totalSessions: number;
};

export function ThresholdInput({ cohortId, defaultMin, savedMin, totalSessions }: Props) {
  const [{ min }, setParams] = useQueryStates(
    { min: parseAsInteger.withDefault(defaultMin) },
    { shallow: false }
  );

  const [value, setValue] = useState(String(min));
  useEffect(() => {
    setValue(String(min));
  }, [min]);

  const debouncedSet = useDebouncedCallback((next: number | null) => {
    void setParams({ min: next });
  }, 300);

  const onChange = (raw: string) => {
    setValue(raw);
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      debouncedSet(null);
      return;
    }
    debouncedSet(Math.min(Math.max(1, Math.floor(n)), Math.max(1, totalSessions)));
  };

  const [pending, startTransition] = useTransition();
  const currentNum = Number(value);
  const isValid = Number.isFinite(currentNum) && currentNum > 0;
  const canSave = isValid && Math.floor(currentNum) !== savedMin;

  const onSave = () => {
    if (!canSave) return;
    startTransition(async () => {
      const res = await saveMinAttendance(cohortId, Math.floor(currentNum));
      if (res.ok) toast.success(`수료 기준 ${Math.floor(currentNum)}회로 저장됨`);
      else toast.error(res.error);
    });
  };

  return (
    <div className='flex items-center gap-2'>
      <Label htmlFor='min-attendance' className='text-muted-foreground text-sm'>
        수료 기준
      </Label>
      <Input
        id='min-attendance'
        type='number'
        min={1}
        max={Math.max(1, totalSessions)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className='h-8 w-20 tabular-nums'
      />
      <span className='text-muted-foreground text-sm'>회 이상 출석</span>
      <Button
        size='sm'
        variant='outline'
        disabled={!canSave || pending}
        onClick={onSave}
      >
        {pending ? '저장 중…' : '저장'}
      </Button>
      {savedMin !== null && (
        <span className='text-muted-foreground text-xs'>
          (저장된 값: {savedMin}회)
        </span>
      )}
    </div>
  );
}
