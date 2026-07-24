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
import { createVote } from '../_actions';

export function VoteCreateButton({ cohortId }: { cohortId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await createVote(cohortId, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      if (res.id) router.push(`/dashboard/cohorts/${cohortId}/presentations/${res.id}`);
      else router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ 새 발표 투표</Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>새 발표 투표</DialogTitle>
          <DialogDescription>제목·설명을 입력하고 생성 후 후보를 등록하세요.</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className='grid gap-3 py-2'>
          <div className='grid gap-2'>
            <Label htmlFor='title'>제목 *</Label>
            <Input id='title' name='title' required placeholder='예: 8분 발표 인기 투표' />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='description'>설명 (선택)</Label>
            <Input
              id='description'
              name='description'
              placeholder='예: 좋았던 발표 3명을 뽑아주세요'
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
