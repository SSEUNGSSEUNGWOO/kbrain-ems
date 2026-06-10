'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { createChecklist } from '../_actions';

export function ChecklistCreateButton({ cohortId }: { cohortId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await createChecklist(cohortId, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      if (res.id) router.push(`/dashboard/cohorts/${cohortId}/pretraining/${res.id}`);
      else router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ 새 체크리스트</Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>새 사전 세팅 체크리스트</DialogTitle>
          <DialogDescription>제목·설명을 입력하고 생성 후 항목을 추가하세요.</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className='grid gap-3 py-2'>
          <div className='grid gap-2'>
            <Label htmlFor='title'>제목 *</Label>
            <Input id='title' name='title' required placeholder='예: AI 파이썬 실습 사전 세팅' />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='description'>안내문 (선택)</Label>
            <Input id='description' name='description' placeholder='예: 실습 환경 사전 확인' />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='guide_url'>가이드 URL (선택)</Label>
            <Input
              id='guide_url'
              name='guide_url'
              type='url'
              placeholder='https://2026-toolguide.vercel.app/'
            />
          </div>
          {error && <div className='text-destructive text-sm'>{error}</div>}
          <DialogFooter>
            <Button type='submit' disabled={pending}>
              {pending ? '생성 중...' : '생성'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
