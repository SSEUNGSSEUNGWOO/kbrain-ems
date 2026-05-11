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
import { updateSurvey } from '../_actions';

type Props = {
  cohortId: string;
  surveyId: string;
  initialTitle: string;
  initialShareCode: string | null;
  trigger: React.ReactNode;
};

export function SurveyEditSheet({ cohortId, surveyId, initialTitle, initialShareCode, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [shareCode, setShareCode] = useState(initialShareCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateSurvey(cohortId, surveyId, { title, shareCode });
      if (result.error) {
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
          <SheetTitle>설문 메타 수정</SheetTitle>
          <SheetDescription>
            제목·공유 코드만 변경 가능. 강사·세션·문항을 바꾸려면 삭제 후 새로 생성하세요.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className='grid gap-4 px-4 py-4'>
          <div className='grid gap-2'>
            <Label htmlFor='edit-title'>제목 *</Label>
            <Input id='edit-title' value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='edit-share-code'>공유 코드 *</Label>
            <Input
              id='edit-share-code'
              value={shareCode}
              onChange={(e) => setShareCode(e.target.value)}
              required
              className='font-mono'
            />
            <p className='text-xs text-muted-foreground'>
              변경 시 기존 카톡방에 올린 링크는 무효가 됩니다.
            </p>
          </div>

          {error && <div className='rounded-md bg-red-50 px-3 py-2 text-sm text-red-700'>{error}</div>}

          <Button type='submit' disabled={pending}>
            {pending ? '저장 중...' : '저장'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
