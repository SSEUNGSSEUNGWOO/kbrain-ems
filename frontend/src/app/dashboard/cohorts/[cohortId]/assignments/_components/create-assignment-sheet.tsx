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
import { Textarea } from '@/components/ui/textarea';
import { createAssignment } from '../_actions';

export function CreateAssignmentSheet({ cohortId }: { cohortId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createAssignment(cohortId, formData);
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
        <Button>+ 과제 추가</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>새 과제 등록</SheetTitle>
          <SheetDescription>이 교육과정에 출제할 과제를 등록합니다.</SheetDescription>
        </SheetHeader>
        <form action={onSubmit} className='grid gap-4 px-4 py-4'>
          <div className='grid gap-2'>
            <Label htmlFor='assignment-title'>과제명 *</Label>
            <Input
              id='assignment-title'
              name='title'
              required
              placeholder='예: 최종 프로젝트 제안서'
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='assignment-description'>설명 (선택)</Label>
            <Textarea
              id='assignment-description'
              name='description'
              placeholder='제출 형식, 평가 기준 등'
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='assignment-due-date'>제출 기한 (선택)</Label>
            <Input id='assignment-due-date' name='due_date' type='date' />
          </div>
          {error && <div className='text-destructive text-sm'>{error}</div>}
          <SheetFooter>
            <Button type='submit' disabled={pending}>
              {pending ? '등록 중...' : '등록'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
