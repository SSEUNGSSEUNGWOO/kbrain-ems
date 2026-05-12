'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
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
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { computeCohortStage, STAGE_LABEL, type CohortStage } from '@/lib/cohort-stage';
import { updateCohort, deleteCohort } from '../_actions';

const STAGE_BADGE_CLASS: Record<CohortStage, string> = {
  recruiting:
    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
  active:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  finished:
    'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300',
  preparing:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  unset:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
};

type Cohort = {
  id: string;
  name: string;
  started_at: string | null;
  ended_at: string | null;
  recruiting_slug: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  max_capacity: number | null;
  student_count: number;
  session_count: number;
};

export function CohortCard({ cohort }: { cohort: Cohort }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { isDeveloper } = useAuth();

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
      <div className='group relative overflow-hidden rounded-xl border transition-all hover:shadow-md'>
        <div className='absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-500 to-violet-500' />
        <Link href={`/dashboard/cohorts/${cohort.id}`} className='flex items-center gap-4 py-3 pl-5 pr-24'>
          <div className='min-w-[10rem] shrink-0'>
            <div className='font-semibold'>{cohort.name}</div>
            <div className='text-muted-foreground mt-0.5 text-xs'>
              {cohort.started_at ?? '시작일 미정'} ~ {cohort.ended_at ?? '종료일 미정'}
            </div>
          </div>
          <div className='flex flex-1 flex-wrap items-center gap-2'>
            {(() => {
              const stage = computeCohortStage(cohort);
              const suffix =
                stage === 'recruiting' && cohort.application_end_at
                  ? ` ~${cohort.application_end_at}`
                  : stage === 'active' && cohort.ended_at
                    ? ` ~${cohort.ended_at}`
                    : '';
              return (
                <Badge variant='outline' className={`gap-1 font-semibold ${STAGE_BADGE_CLASS[stage]}`}>
                  {STAGE_LABEL[stage]}
                  {suffix}
                </Badge>
              );
            })()}
            <Badge variant='outline' className='gap-1 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'>
              <Icons.teams className='h-3 w-3' />
              {cohort.student_count}명{cohort.max_capacity ? ` / ${cohort.max_capacity}` : ''}
            </Badge>
            <Badge variant='outline' className='gap-1 border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300'>
              <Icons.calendar className='h-3 w-3' />
              {cohort.session_count}회
            </Badge>
          </div>
        </Link>
        {isDeveloper && (
          <div className='absolute right-2 top-1/2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
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
        )}
      </div>

      {/* 수정 Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>기수 수정</SheetTitle>
            <SheetDescription>기수 정보를 수정합니다.</SheetDescription>
          </SheetHeader>
          <form action={onUpdate} className='grid gap-4 overflow-y-auto px-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='edit-name'>기수 이름</Label>
              <Input id='edit-name' name='name' required defaultValue={cohort.name} />
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <div className='grid gap-2'>
                <Label htmlFor='edit-started'>교육 시작일</Label>
                <Input id='edit-started' name='started_at' type='date' defaultValue={cohort.started_at ?? ''} />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='edit-ended'>교육 종료일</Label>
                <Input id='edit-ended' name='ended_at' type='date' defaultValue={cohort.ended_at ?? ''} />
              </div>
            </div>

            <div className='mt-2 border-t pt-3'>
              <p className='mb-2 text-xs font-semibold text-muted-foreground'>모집 정보</p>
              <div className='grid gap-3'>
                <div className='grid gap-2'>
                  <Label htmlFor='edit-slug'>모집 코드 (slug)</Label>
                  <Input
                    id='edit-slug'
                    name='recruiting_slug'
                    placeholder='예: aichamp-26-1'
                    defaultValue={cohort.recruiting_slug ?? ''}
                    className='font-mono'
                  />
                  <p className='text-[11px] text-muted-foreground'>외부 신청 URL: /apply/&#123;slug&#125;</p>
                </div>
                <div className='grid grid-cols-2 gap-2'>
                  <div className='grid gap-2'>
                    <Label htmlFor='edit-app-start'>모집 시작일</Label>
                    <Input
                      id='edit-app-start'
                      name='application_start_at'
                      type='date'
                      defaultValue={cohort.application_start_at ?? ''}
                    />
                  </div>
                  <div className='grid gap-2'>
                    <Label htmlFor='edit-app-end'>모집 마감일</Label>
                    <Input
                      id='edit-app-end'
                      name='application_end_at'
                      type='date'
                      defaultValue={cohort.application_end_at ?? ''}
                    />
                  </div>
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='edit-cap'>정원 (선택)</Label>
                  <Input
                    id='edit-cap'
                    name='max_capacity'
                    type='number'
                    min={1}
                    defaultValue={cohort.max_capacity ?? ''}
                  />
                </div>
              </div>
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
