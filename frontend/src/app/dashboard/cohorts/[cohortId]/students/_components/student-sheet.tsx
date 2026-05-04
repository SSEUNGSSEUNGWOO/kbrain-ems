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
import { createStudent, updateStudent } from '../_actions';

type Student = {
  id: string;
  name: string;
  organizations: { name: string }[] | { name: string } | null;
  department: string | null;
  job_title: string | null;
  job_role: string | null;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

interface StudentSheetProps {
  cohortId: string;
  student?: Student;
  trigger: React.ReactNode;
}

function getOrgName(org: Student['organizations']): string {
  if (!org) return '';
  if (Array.isArray(org)) return org[0]?.name ?? '';
  return org.name;
}

export function StudentSheet({ cohortId, student, trigger }: StudentSheetProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isEdit = !!student;

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateStudent(student.id, cohortId, formData)
        : await createStudent(cohortId, formData);
      if (result?.error) { setError(result.error); return; }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className='overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>{isEdit ? '인원 수정' : '인원 추가'}</SheetTitle>
          <SheetDescription>
            {isEdit ? '교육생 정보를 수정합니다.' : '새 교육생을 등록합니다.'}
          </SheetDescription>
        </SheetHeader>
        <form action={onSubmit} className='grid gap-4 px-4 py-4'>
          <div className='grid gap-2'>
            <Label htmlFor='name'>이름 *</Label>
            <Input id='name' name='name' required defaultValue={student?.name ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='organization'>소속 기관</Label>
            <Input id='organization' name='organization' placeholder='예: 행정안전부' defaultValue={getOrgName(student?.organizations ?? null)} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='department'>부서</Label>
            <Input id='department' name='department' defaultValue={student?.department ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='job_title'>담당업무</Label>
            <Input id='job_title' name='job_title' defaultValue={student?.job_title ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='job_role'>직렬</Label>
            <Input id='job_role' name='job_role' defaultValue={student?.job_role ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='birth_date'>생년월일</Label>
            <Input id='birth_date' name='birth_date' type='date' defaultValue={student?.birth_date ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='email'>이메일</Label>
            <Input id='email' name='email' type='email' defaultValue={student?.email ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='phone'>연락처</Label>
            <Input id='phone' name='phone' defaultValue={student?.phone ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='notes'>비고</Label>
            <Input id='notes' name='notes' defaultValue={student?.notes ?? ''} />
          </div>
          {error && <div className='text-destructive text-sm'>{error}</div>}
          <SheetFooter>
            <Button type='submit' disabled={pending}>
              {pending ? (isEdit ? '저장 중...' : '추가 중...') : (isEdit ? '저장' : '추가')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
