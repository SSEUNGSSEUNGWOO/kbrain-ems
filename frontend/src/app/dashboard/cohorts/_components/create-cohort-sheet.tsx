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
import { createCohort } from '../_actions';

export function CreateCohortSheet() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createCohort(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      // 사이드바 cohort 목록도 갱신해야 하므로 router.refresh 대신 전체 reload
      window.location.reload();
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>+ 기수 추가</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>새 기수 등록</SheetTitle>
          <SheetDescription>새 교육 기수를 등록합니다.</SheetDescription>
        </SheetHeader>
        <form action={onSubmit} className='grid gap-4 overflow-y-auto px-4 py-4'>
          <div className='grid gap-2'>
            <Label htmlFor='name'>기수 이름</Label>
            <Input id='name' name='name' required placeholder='예: AI 챔피언 26-1기' />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='create-category'>구분</Label>
            <select
              id='create-category'
              name='category'
              defaultValue=''
              className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
            >
              <option value=''>— 미분류</option>
              <option value='champion'>AI 챔피언</option>
              <option value='general'>일반교육</option>
              <option value='special'>특화교육</option>
              <option value='experts'>전문인재</option>
            </select>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <div className='grid gap-2'>
              <Label htmlFor='started_at'>교육 시작일</Label>
              <Input id='started_at' name='started_at' type='date' />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='ended_at'>교육 종료일</Label>
              <Input id='ended_at' name='ended_at' type='date' />
            </div>
          </div>

          <div className='mt-2 border-t pt-3'>
            <p className='mb-2 text-xs font-semibold text-muted-foreground'>
              모집 정보 (입력 시 외부 신청 페이지 활성화)
            </p>
            <div className='grid gap-3'>
              <div className='grid gap-2'>
                <Label htmlFor='recruiting_slug'>모집 코드 (slug)</Label>
                <Input
                  id='recruiting_slug'
                  name='recruiting_slug'
                  placeholder='예: aichamp-26-1'
                  className='font-mono'
                />
                <p className='text-[11px] text-muted-foreground'>
                  외부 신청 URL: <code>/apply/&#123;slug&#125;</code>
                </p>
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <div className='grid gap-2'>
                  <Label htmlFor='application_start_at'>모집 시작일</Label>
                  <Input id='application_start_at' name='application_start_at' type='date' />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='application_end_at'>모집 마감일</Label>
                  <Input id='application_end_at' name='application_end_at' type='date' />
                </div>
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='max_capacity'>정원 (선택)</Label>
                <Input
                  id='max_capacity'
                  name='max_capacity'
                  type='number'
                  min={1}
                  placeholder='예: 24'
                />
              </div>
            </div>
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
