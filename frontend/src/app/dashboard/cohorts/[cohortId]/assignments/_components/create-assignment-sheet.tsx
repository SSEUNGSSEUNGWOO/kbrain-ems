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

type SessionOpt = { id: string; title: string | null; session_date: string };

export function CreateAssignmentSheet({
  cohortId,
  sessions
}: {
  cohortId: string;
  sessions: SessionOpt[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const router = useRouter();

  const reset = () => {
    setTitle('');
    setTitleEdited(false);
    setError(null);
  };

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createAssignment(cohortId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
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
            <Label htmlFor='assignment-session'>연결 회차 (선택)</Label>
            <select
              id='assignment-session'
              name='session_id'
              className='border-input bg-background rounded-md border px-3 py-2 text-sm'
              onChange={(e) => {
                const id = e.target.value;
                if (!titleEdited) {
                  const sess = sessions.find((s) => s.id === id);
                  if (sess?.title) setTitle(`${sess.title} 과제`);
                  else setTitle('');
                }
              }}
            >
              <option value=''>연결 없음 (코호트 공통)</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.session_date} · {s.title ?? '제목 없음'}
                </option>
              ))}
            </select>
            <p className='text-muted-foreground text-[11px]'>
              회차 선택 시 과제명이 "회차명 과제" 형식으로 자동 채워집니다. 그 수업 상세 페이지에도 표시됩니다.
            </p>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='assignment-title'>과제명 *</Label>
            <Input
              id='assignment-title'
              name='title'
              required
              placeholder='예: [기술교육] 1회차 과제'
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
              }}
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
