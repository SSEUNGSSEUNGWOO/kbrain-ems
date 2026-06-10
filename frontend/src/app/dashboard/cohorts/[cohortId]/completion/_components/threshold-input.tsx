'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, useQueryStates } from 'nuqs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

type Props = {
  defaultMin: number;
  totalSessions: number;
};

export function ThresholdInput({ defaultMin, totalSessions }: Props) {
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
    </div>
  );
}
