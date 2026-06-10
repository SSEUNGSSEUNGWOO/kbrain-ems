'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { addItem } from '../_actions';

type ExistingItem = { id: string; question_no: string; text: string };

type Props = {
  cohortId: string;
  checklistId: string;
  existingItems: ExistingItem[];
};

export function ItemAddForm({ cohortId, checklistId, existingItems }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [parentId, setParentId] = useState('');
  const [parentAnswer, setParentAnswer] = useState<'yes' | 'no'>('yes');
  const router = useRouter();

  const onSubmit = (formData: FormData) => {
    setError(null);
    formData.set('parent_id', parentId);
    formData.set('parent_answer', parentAnswer);
    startTransition(async () => {
      const res = await addItem(cohortId, checklistId, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      const form = document.getElementById('item-add-form') as HTMLFormElement | null;
      form?.reset();
      setParentId('');
      setParentAnswer('yes');
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className='py-4'>
        <h3 className='mb-3 text-sm font-medium'>+ 항목 추가</h3>
        <form id='item-add-form' action={onSubmit} className='grid gap-3'>
          <div className='grid grid-cols-[80px_1fr] gap-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='question_no' className='text-xs'>번호</Label>
              <Input id='question_no' name='question_no' placeholder='자동' />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='text' className='text-xs'>항목 내용 *</Label>
              <Input
                id='text'
                name='text'
                required
                placeholder='예: Zoom 프로그램을 설치 완료하셨습니까?'
              />
            </div>
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='guide_url' className='text-xs'>가이드 URL (선택)</Label>
            <Input
              id='guide_url'
              name='guide_url'
              type='url'
              placeholder='예: https://zoom.us/test'
            />
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='no_hint' className='text-xs'>"아니오" 선택 시 안내 (선택)</Label>
            <Input
              id='no_hint'
              name='no_hint'
              placeholder='예: https://zoom.us/test 접속 후 테스트 진행 요청'
            />
          </div>

          {existingItems.length > 0 && (
            <div className='grid grid-cols-[1fr_120px] gap-2'>
              <div className='grid gap-1.5'>
                <Label className='text-xs'>후속 분기 — 어떤 항목 다음 (선택)</Label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className='border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
                >
                  <option value=''>항상 노출</option>
                  {existingItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.question_no}. {it.text.slice(0, 30)}
                      {it.text.length > 30 ? '…' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className='grid gap-1.5'>
                <Label className='text-xs'>의 답이</Label>
                <select
                  value={parentAnswer}
                  onChange={(e) => setParentAnswer(e.target.value as 'yes' | 'no')}
                  disabled={!parentId}
                  className='border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50'
                >
                  <option value='yes'>예</option>
                  <option value='no'>아니오</option>
                </select>
              </div>
            </div>
          )}

          {error && <div className='text-destructive text-xs'>{error}</div>}
          <div className='flex justify-end'>
            <Button type='submit' size='sm' disabled={pending}>
              {pending ? '추가 중...' : '추가'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
