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
import { createApplicant, updateApplicant } from '../_actions';

export type Applicant = {
  id: string;
  name: string;
  organizationName: string | null;
  organizationCategory: string | null;
  department: string | null;
  job_title: string | null;
  job_role: string | null;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

interface ApplicantSheetProps {
  applicant?: Applicant;
  trigger: React.ReactNode;
}

export function ApplicantSheet({ applicant, trigger }: ApplicantSheetProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isEdit = !!applicant;

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateApplicant(applicant.id, formData)
        : await createApplicant(formData);
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
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className='overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>{isEdit ? '지원자 수정' : '지원자 추가'}</SheetTitle>
          <SheetDescription>
            {isEdit ? '지원자 정보를 수정합니다.' : '새 지원자를 등록합니다.'}
          </SheetDescription>
        </SheetHeader>
        <form action={onSubmit} className='grid gap-4 px-4 py-4'>
          <div className='grid gap-2'>
            <Label htmlFor='name'>이름 *</Label>
            <Input id='name' name='name' required defaultValue={applicant?.name ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='organization'>소속 기관</Label>
            <Input
              id='organization'
              name='organization'
              placeholder='예: 행정안전부'
              defaultValue={applicant?.organizationName ?? ''}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='department'>부서</Label>
            <Input
              id='department'
              name='department'
              placeholder='예: 인사혁신과'
              defaultValue={applicant?.department ?? ''}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='job_title'>직책</Label>
            <Input id='job_title' name='job_title' defaultValue={applicant?.job_title ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='job_role'>직렬</Label>
            <Input id='job_role' name='job_role' defaultValue={applicant?.job_role ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='birth_date'>생년월일</Label>
            <Input
              id='birth_date'
              name='birth_date'
              type='date'
              defaultValue={applicant?.birth_date ?? ''}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='email'>이메일</Label>
            <Input id='email' name='email' type='email' defaultValue={applicant?.email ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='phone'>연락처</Label>
            <Input id='phone' name='phone' defaultValue={applicant?.phone ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='notes'>비고</Label>
            <Input id='notes' name='notes' defaultValue={applicant?.notes ?? ''} />
          </div>
          {error && <div className='text-destructive text-sm'>{error}</div>}
          <SheetFooter>
            <Button type='submit' disabled={pending}>
              {pending ? (isEdit ? '저장 중...' : '추가 중...') : isEdit ? '저장' : '추가'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
