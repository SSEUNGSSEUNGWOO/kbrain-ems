'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { createApplication, updateApplication } from '../_actions';

export type Cohort = { id: string; name: string };

export type Application = {
  id: string;
  cohort_id: string;
  status: string;
  rejected_stage: string | null;
  applied_at: string | null;
  decided_at: string | null;
  note: string | null;
};

interface ApplicationSheetProps {
  applicantId: string;
  cohorts: Cohort[];
  application?: Application;
  trigger: React.ReactNode;
}

const STATUS_OPTIONS = [
  { value: 'applied', label: '접수' },
  { value: 'shortlisted', label: '서류 합격' },
  { value: 'selected', label: '최종 합격' },
  { value: 'rejected', label: '탈락' },
  { value: 'withdrew', label: '철회' }
] as const;

const STAGE_OPTIONS = [
  { value: 'docs', label: '서류' },
  { value: 'interview', label: '면접' },
  { value: 'final', label: '최종' }
] as const;

export function ApplicationSheet({
  applicantId,
  cohorts,
  application,
  trigger
}: ApplicationSheetProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cohortId, setCohortId] = useState(application?.cohort_id ?? '');
  const [status, setStatus] = useState(application?.status ?? 'applied');
  const [stage, setStage] = useState(application?.rejected_stage ?? '');
  const router = useRouter();
  const isEdit = !!application;

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateApplication(application.id, applicantId, formData)
        : await createApplication(applicantId, formData);
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
          <SheetTitle>{isEdit ? '지원 이력 수정' : '지원 이력 추가'}</SheetTitle>
          <SheetDescription>
            기수와 결과를 입력합니다.
          </SheetDescription>
        </SheetHeader>
        <form action={onSubmit} className='grid gap-4 px-4 py-4'>
          <input type='hidden' name='cohort_id' value={cohortId} />
          <input type='hidden' name='status' value={status} />
          <input
            type='hidden'
            name='rejected_stage'
            value={status === 'rejected' ? stage : ''}
          />

          <div className='grid gap-2'>
            <Label>기수 *</Label>
            <Select value={cohortId} onValueChange={setCohortId}>
              <SelectTrigger>
                <SelectValue placeholder='기수 선택' />
              </SelectTrigger>
              <SelectContent>
                {cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='grid gap-2'>
            <Label>결과 *</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {status === 'rejected' && (
            <div className='grid gap-2'>
              <Label>탈락 단계</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue placeholder='단계 선택' />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-2'>
              <Label htmlFor='applied_at'>지원일</Label>
              <Input
                id='applied_at'
                name='applied_at'
                type='date'
                defaultValue={application?.applied_at ?? ''}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='decided_at'>결정일</Label>
              <Input
                id='decided_at'
                name='decided_at'
                type='date'
                defaultValue={application?.decided_at ?? ''}
              />
            </div>
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='note'>메모</Label>
            <Input id='note' name='note' defaultValue={application?.note ?? ''} />
          </div>

          {error && <div className='text-destructive text-sm'>{error}</div>}
          <SheetFooter>
            <Button type='submit' disabled={pending || !cohortId}>
              {pending
                ? isEdit
                  ? '저장 중...'
                  : '추가 중...'
                : isEdit
                  ? '저장'
                  : '추가'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label])
);

export const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  STAGE_OPTIONS.map((o) => [o.value, o.label])
);
