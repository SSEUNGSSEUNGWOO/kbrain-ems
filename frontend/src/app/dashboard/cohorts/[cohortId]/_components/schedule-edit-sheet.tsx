'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateCohortSchedule } from '../../_actions';

export type ScheduleValues = {
  application_start_at: string | null;
  application_end_at: string | null;
  decided_at: string | null;
  notified_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  orientation_date: string | null;
  delivery_method: string | null;
  max_capacity: number | null;
};

export function ScheduleEditSheet({
  cohortId,
  initial,
  hasRound,
  trigger
}: {
  cohortId: string;
  initial: ScheduleValues;
  hasRound: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateCohortSchedule(cohortId, formData);
      if (res.error) {
        setError(res.error);
        toast.error(`저장 실패: ${res.error}`);
        return;
      }
      toast.success('일정 정보가 저장되었습니다.');
      setOpen(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className='overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>일정 정보 수정</SheetTitle>
          <SheetDescription>
            모집·선발·교육·OT 일정과 진행 방법, 정원을 수정합니다.
          </SheetDescription>
        </SheetHeader>
        {hasRound && (
          <div className='border-amber-300 bg-amber-50 text-amber-900 mx-4 mt-2 rounded-md border px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'>
            라운드 매핑 중에는 <strong>신청기간·선발일·선발통보</strong>는 라운드 값이 우선
            표시됩니다. 여기에 입력한 값은 라운드 매핑을 해제할 때 사용됩니다.
          </div>
        )}
        <form action={onSubmit} className='grid gap-4 px-4 py-4'>
          <section className='grid gap-3'>
            <div className='text-muted-foreground text-xs font-semibold uppercase tracking-wider'>
              모집·선발
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <FieldDate
                id='application_start_at'
                label='신청 시작'
                defaultValue={initial.application_start_at}
              />
              <FieldDate
                id='application_end_at'
                label='신청 마감'
                defaultValue={initial.application_end_at}
              />
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <FieldDate id='decided_at' label='선발일' defaultValue={initial.decided_at} />
              <FieldDate id='notified_at' label='선발통보일' defaultValue={initial.notified_at} />
            </div>
          </section>

          <section className='grid gap-3'>
            <div className='text-muted-foreground text-xs font-semibold uppercase tracking-wider'>
              교육
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <FieldDate id='started_at' label='교육 시작' defaultValue={initial.started_at} />
              <FieldDate id='ended_at' label='교육 종료' defaultValue={initial.ended_at} />
            </div>
            <FieldDate id='orientation_date' label='OT' defaultValue={initial.orientation_date} />
          </section>

          <section className='grid gap-3'>
            <div className='text-muted-foreground text-xs font-semibold uppercase tracking-wider'>
              진행 정보
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='delivery_method'>방법</Label>
              <select
                id='delivery_method'
                name='delivery_method'
                defaultValue={initial.delivery_method ?? ''}
                className='border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              >
                <option value=''>— 미지정</option>
                <option value='대면'>대면</option>
                <option value='비대면'>비대면</option>
                <option value='과제형'>과제형</option>
                <option value='블렌디드'>블렌디드</option>
              </select>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='max_capacity'>정원 (명)</Label>
              <Input
                id='max_capacity'
                name='max_capacity'
                type='number'
                min='1'
                defaultValue={initial.max_capacity ?? ''}
              />
            </div>
          </section>

          {error && <div className='text-destructive text-sm'>{error}</div>}

          <SheetFooter className='mt-4'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              취소
            </Button>
            <Button type='submit' disabled={pending}>
              {pending ? '저장 중…' : '저장'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FieldDate({
  id,
  label,
  defaultValue
}: {
  id: string;
  label: string;
  defaultValue: string | null;
}) {
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id} className='text-xs'>
        {label}
      </Label>
      <Input id={id} name={id} type='date' defaultValue={defaultValue ?? ''} />
    </div>
  );
}
