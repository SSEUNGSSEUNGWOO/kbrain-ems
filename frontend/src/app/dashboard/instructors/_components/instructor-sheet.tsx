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
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { createInstructor, updateInstructor } from '../_actions';

export type Instructor = {
  id: string;
  name: string;
  affiliation: string | null;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type Props = {
  instructor?: Instructor;
  trigger: React.ReactNode;
  kind?: 'main' | 'sub'; // 새 추가 시 어느 풀에 들어갈지 (수정엔 무시)
};

export function InstructorSheet({ instructor, trigger, kind = 'main' }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const label = kind === 'sub' ? '보조강사' : '강사';
  const isEdit = !!instructor;

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateInstructor(instructor.id, formData)
        : await createInstructor(formData);
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
          <SheetTitle>{isEdit ? `${label} 수정` : `${label} 추가`}</SheetTitle>
          <SheetDescription>
            {isEdit ? `${label} 정보를 수정합니다.` : `새 ${label}를 등록합니다. 모든 기수에서 공통으로 사용됩니다.`}
          </SheetDescription>
        </SheetHeader>
        <form action={onSubmit} className='grid gap-4 px-4 py-4'>
          {!isEdit && <input type='hidden' name='kind' value={kind} />}
          <div className='grid gap-2'>
            <Label htmlFor='name'>이름 *</Label>
            <Input id='name' name='name' required defaultValue={instructor?.name ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='affiliation'>소속</Label>
            <Input
              id='affiliation'
              name='affiliation'
              placeholder='예: 사무관, NIA'
              defaultValue={instructor?.affiliation ?? ''}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='specialty'>전공·전문분야</Label>
            <Input
              id='specialty'
              name='specialty'
              placeholder='예: AI 에이전트·기술'
              defaultValue={instructor?.specialty ?? ''}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='email'>이메일</Label>
            <Input
              id='email'
              name='email'
              type='email'
              defaultValue={instructor?.email ?? ''}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='phone'>전화</Label>
            <Input id='phone' name='phone' defaultValue={instructor?.phone ?? ''} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='notes'>메모</Label>
            <Input id='notes' name='notes' defaultValue={instructor?.notes ?? ''} />
          </div>

          {error && (
            <div className='rounded-md bg-red-50 px-3 py-2 text-sm text-red-700'>{error}</div>
          )}

          <Button type='submit' disabled={pending}>
            {pending ? '저장 중...' : isEdit ? '수정' : '추가'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
