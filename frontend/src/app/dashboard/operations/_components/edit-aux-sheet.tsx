'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { Icons } from '@/components/icons';
import { setSessionMembers } from '../_actions';

type Option = { id: string; name: string; affiliation?: string | null };

type Props = {
  sessionId: string;
  sessionLabel: string;
  mainInstructors: Option[]; // kind='main' 후보
  subInstructors: Option[]; // kind='sub' 후보
  operators: Option[];
  currentMainIds: string[];
  currentSubIds: string[];
  currentOperatorIds: string[];
};

export function EditAuxSheet({
  sessionId,
  sessionLabel,
  mainInstructors,
  subInstructors,
  operators,
  currentMainIds,
  currentSubIds,
  currentOperatorIds
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mainIds, setMainIds] = useState<Set<string>>(new Set(currentMainIds));
  const [subIds, setSubIds] = useState<Set<string>>(new Set(currentSubIds));
  const [opIds, setOpIds] = useState<Set<string>>(new Set(currentOperatorIds));
  const router = useRouter();

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await setSessionMembers(sessionId, [...mainIds], [...subIds], [...opIds]);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setMainIds(new Set(currentMainIds));
          setSubIds(new Set(currentSubIds));
          setOpIds(new Set(currentOperatorIds));
          setError(null);
        }
      }}
    >
      <SheetTrigger asChild>
        <button
          type='button'
          className='inline-flex items-center gap-1 rounded p-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground'
          aria-label='강사·보조강사·운영자 편집'
        >
          <Icons.edit className='h-3.5 w-3.5' />
        </button>
      </SheetTrigger>
      <SheetContent className='overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>구성원 편집</SheetTitle>
          <SheetDescription>{sessionLabel}</SheetDescription>
        </SheetHeader>
        <div className='space-y-5 px-4 py-4'>
          <PickerBlock
            title='강사'
            color='blue'
            options={mainInstructors}
            selected={mainIds}
            onToggle={(id) => toggle(mainIds, setMainIds, id)}
            emptyHint='등록된 강사가 없습니다. 강사풀 → 강사 탭에서 추가.'
          />
          <PickerBlock
            title='보조강사'
            color='amber'
            options={subInstructors}
            selected={subIds}
            onToggle={(id) => toggle(subIds, setSubIds, id)}
            emptyHint='등록된 보조강사가 없습니다. 강사풀 → 보조강사 탭에서 추가.'
          />
          <PickerBlock
            title='운영자'
            color='emerald'
            options={operators}
            selected={opIds}
            onToggle={(id) => toggle(opIds, setOpIds, id)}
            emptyHint='등록된 운영자가 없습니다.'
          />
          {error && <div className='text-destructive text-sm'>{error}</div>}
        </div>
        <SheetFooter>
          <Button variant='outline' onClick={() => setOpen(false)} disabled={pending}>
            취소
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? '저장 중…' : '저장'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PickerBlock({
  title,
  color,
  options,
  selected,
  onToggle,
  emptyHint
}: {
  title: string;
  color: 'blue' | 'amber' | 'emerald';
  options: Option[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyHint: string;
}) {
  const accent: Record<typeof color, string> = {
    blue: 'accent-blue-600',
    amber: 'accent-amber-600',
    emerald: 'accent-emerald-600'
  };
  return (
    <div className='space-y-2'>
      <Label className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
        {title} <span className='ml-1 text-muted-foreground'>({selected.size}명 선택)</span>
      </Label>
      <div className='max-h-56 space-y-1 overflow-y-auto rounded border p-2'>
        {options.length === 0 ? (
          <p className='py-2 text-center text-xs text-muted-foreground'>{emptyHint}</p>
        ) : (
          options.map((o) => (
            <label
              key={o.id}
              className='flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-muted'
            >
              <input
                type='checkbox'
                checked={selected.has(o.id)}
                onChange={() => onToggle(o.id)}
                className={`h-4 w-4 cursor-pointer ${accent[color]}`}
              />
              <span>{o.name}</span>
              {o.affiliation && (
                <span className='text-xs text-muted-foreground'>· {o.affiliation}</span>
              )}
            </label>
          ))
        )}
      </div>
    </div>
  );
}
