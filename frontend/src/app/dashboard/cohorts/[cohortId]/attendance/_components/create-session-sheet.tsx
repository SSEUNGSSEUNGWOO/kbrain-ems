'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { createSession } from '../_actions';

export function CreateSessionSheet({ cohortId }: { cohortId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createSession(cohortId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>+ 수업 추가</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>수업 추가</SheetTitle>
          <SheetDescription>출결을 관리할 수업 회차를 등록합니다.</SheetDescription>
        </SheetHeader>
        <form action={onSubmit} className='grid gap-4 px-4 py-4'>
          <div className='grid gap-2'>
            <Label htmlFor='session_date'>수업 날짜 *</Label>
            <Input id='session_date' name='session_date' type='date' required />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-2'>
              <Label htmlFor='start_time'>시작 시간</Label>
              <Input id='start_time' name='start_time' type='time' />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='end_time'>종료 시간</Label>
              <Input id='end_time' name='end_time' type='time' />
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='break_minutes'>휴식 시간 (분)</Label>
            <Input id='break_minutes' name='break_minutes' type='number' min='0' step='10' defaultValue='60' placeholder='예: 60' />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='title'>제목 (선택)</Label>
            <Input id='title' name='title' placeholder='예: 1일차, Python 기초' />
          </div>
          {error && <div className='text-destructive text-sm'>{error}</div>}
          <SheetFooter>
            <Button type='submit' disabled={pending}>
              {pending ? '추가 중...' : '추가'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
