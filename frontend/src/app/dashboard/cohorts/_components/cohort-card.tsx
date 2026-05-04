'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
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
  SheetTitle
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Icons } from '@/components/icons';
import { updateCohort, deleteCohort } from '../_actions';

type Cohort = {
  id: string;
  name: string;
  started_at: string | null;
  ended_at: string | null;
};

export function CohortCard({ cohort }: { cohort: Cohort }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onUpdate = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await updateCohort(cohort.id, formData);
      if (result?.error) { setError(result.error); return; }
      setEditOpen(false);
      router.refresh();
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      const result = await deleteCohort(cohort.id);
      if (result?.error) { setError(result.error); setDeleteOpen(false); return; }
      router.refresh();
    });
  };

  return (
    <>
      <div className='hover:bg-accent group relative rounded-md border p-4 transition-colors'>
        <Link href={`/dashboard/cohorts/${cohort.id}`} className='block'>
          <div className='pr-16 font-semibold'>{cohort.name}</div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {cohort.started_at ?? '시작일 미정'} ~ {cohort.ended_at ?? '종료일 미정'}
          </div>
        </Link>
        <div className='absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7'
            onClick={(e) => { e.preventDefault(); setEditOpen(true); }}
          >
            <Icons.edit className='h-3.5 w-3.5' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='text-destructive hover:text-destructive h-7 w-7'
            onClick={(e) => { e.preventDefault(); setError(null); setDeleteOpen(true); }}
          >
            <Icons.trash className='h-3.5 w-3.5' />
          </Button>
        </div>
      </div>

      {/* 수정 Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>기수 수정</SheetTitle>
            <SheetDescription>기수 정보를 수정합니다.</SheetDescription>
          </SheetHeader>
          <form action={onUpdate} className='grid gap-4 px-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='edit-name'>기수 이름</Label>
              <Input id='edit-name' name='name' required defaultValue={cohort.name} />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='edit-started'>시작일 (선택)</Label>
              <Input id='edit-started' name='started_at' type='date' defaultValue={cohort.started_at ?? ''} />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='edit-ended'>종료일 (선택)</Label>
              <Input id='edit-ended' name='ended_at' type='date' defaultValue={cohort.ended_at ?? ''} />
            </div>
            {error && <div className='text-destructive text-sm'>{error}</div>}
            <SheetFooter>
              <Button type='submit' disabled={pending}>{pending ? '저장 중...' : '저장'}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* 삭제 확인 Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기수 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{cohort.name}</strong>을(를) 삭제하시겠습니까?
              {' '}교육생이 등록된 기수는 삭제할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <div className='text-destructive text-sm px-1'>{error}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={pending}
              className='bg-destructive hover:bg-destructive/90 text-white'
            >
              {pending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
