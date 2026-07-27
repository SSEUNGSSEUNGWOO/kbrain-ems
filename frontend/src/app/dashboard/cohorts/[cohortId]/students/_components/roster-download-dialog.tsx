'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Icons } from '@/components/icons';
import {
  ROSTER_COLUMNS,
  ROSTER_DEFAULT_COLUMNS,
  type RosterColumnKey
} from '@/lib/roster-columns';

type Props = {
  cohortId: string;
  hidePersonal: boolean;
};

export function RosterDownloadDialog({ cohortId, hidePersonal }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<RosterColumnKey>>(
    new Set(ROSTER_DEFAULT_COLUMNS)
  );
  const [includeCancel, setIncludeCancel] = useState(false);

  const toggle = (key: RosterColumnKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onDownload = () => {
    // ROSTER_COLUMNS 순서를 유지한 채 선택된 키만 추출 (서버 순서와 일치)
    const orderedKeys = ROSTER_COLUMNS.map((c) => c.key).filter((k) => selected.has(k));
    const params = new URLSearchParams();
    if (orderedKeys.length > 0) params.set('cols', orderedKeys.join(','));
    if (includeCancel) params.set('includeCancel', '1');
    const qs = params.toString() ? `?${params.toString()}` : '';
    window.location.href = `/api/cohorts/${cohortId}/students/export-simple${qs}`;
    setOpen(false);
  };

  const reset = () => setSelected(new Set(ROSTER_DEFAULT_COLUMNS));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'>
          <Icons.download className='mr-1.5' />
          명단 다운로드
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>명단 다운로드</DialogTitle>
          <DialogDescription>
            엑셀에 포함할 컬럼을 선택하세요. 이름과 NO 는 항상 포함됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className='grid grid-cols-2 gap-x-4 gap-y-2'>
          {ROSTER_COLUMNS.map((c) => {
            const disabled = hidePersonal && c.personal;
            const checked = selected.has(c.key);
            return (
              <label
                key={c.key}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  disabled
                    ? 'cursor-not-allowed opacity-50'
                    : checked
                      ? 'border-primary bg-primary/5 cursor-pointer'
                      : 'cursor-pointer hover:bg-muted/50'
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(c.key)}
                  disabled={disabled}
                />
                <span>{c.label}</span>
                {c.personal && (
                  <span className='ml-auto text-[10px] text-muted-foreground'>개인정보</span>
                )}
              </label>
            );
          })}
        </div>

        <label className='mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm'>
          <Checkbox
            checked={includeCancel}
            onCheckedChange={(v) => setIncludeCancel(v === true)}
          />
          <span>당일취소자 포함</span>
          <span className='ml-auto text-[10px] text-muted-foreground'>상태 컬럼 자동 추가</span>
        </label>

        <DialogFooter className='gap-2 sm:gap-2'>
          <Button type='button' variant='ghost' size='sm' onClick={reset}>
            기본값으로
          </Button>
          <Button type='button' onClick={onDownload}>
            <Icons.download className='mr-1.5' />
            다운로드
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
