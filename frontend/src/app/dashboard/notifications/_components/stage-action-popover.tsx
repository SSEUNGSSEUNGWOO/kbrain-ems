'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
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
import { toast } from 'sonner';
import {
  markStagesSent,
  unmarkStagesSent,
  type DispatchChannel
} from '../_actions';
import type { DispatchTemplate } from '@/lib/dispatch-stages';

type Props = {
  cohortId: string;
  templates: DispatchTemplate[];
  stageLabel: string;
  sentNotificationIds: string[]; // 비어 있으면 미발송 — 발송 처리 UI. 있으면 모두 취소.
};

const CHANNEL_OPTIONS: { value: DispatchChannel; label: string }[] = [
  { value: 'email', label: '메일' },
  { value: 'sms', label: 'SMS' }
];

export function StageActionPopover({
  cohortId,
  templates,
  stageLabel,
  sentNotificationIds
}: Props) {
  const [open, setOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [channels, setChannels] = useState<DispatchChannel[]>(['email', 'sms']);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();

  const toggle = (c: DispatchChannel) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  if (sentNotificationIds.length > 0) {
    return (
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <Button
          variant='ghost'
          size='sm'
          disabled={pending}
          onClick={() => setCancelOpen(true)}
        >
          <Icons.close className='size-4' /> 취소
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{stageLabel} 발송 기록 취소</AlertDialogTitle>
            <AlertDialogDescription>
              발송 완료 표시를 되돌립니다. 기록은 감사 로그로 보존되며 미발송 상태로 돌아갑니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>닫기</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await unmarkStagesSent(sentNotificationIds, cohortId);
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success(`${stageLabel} 발송 기록을 취소했습니다`);
                    setCancelOpen(false);
                  }
                })
              }
            >
              {pending ? '처리 중...' : '취소 처리'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size='sm'>
          <Icons.send className='size-4' /> 발송 처리
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-72' align='end'>
        <div className='space-y-3'>
          <div>
            <div className='text-sm font-medium'>{stageLabel}</div>
            <div className='text-muted-foreground text-xs'>
              발송한 채널과 비고를 기록합니다.
              {templates.length > 1 && ` (${templates.length}개 단계 동시 처리)`}
            </div>
          </div>
          <div className='space-y-2'>
            {CHANNEL_OPTIONS.map((c) => (
              <label key={c.value} className='flex items-center gap-2 text-sm'>
                <Checkbox
                  checked={channels.includes(c.value)}
                  onCheckedChange={() => toggle(c.value)}
                />
                {c.label}
              </label>
            ))}
          </div>
          <Textarea
            placeholder='비고 (선택)'
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div className='flex justify-end gap-2'>
            <Button variant='ghost' size='sm' onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              size='sm'
              disabled={pending || channels.length === 0}
              onClick={() =>
                start(async () => {
                  const res = await markStagesSent({
                    cohortId,
                    templates,
                    channels,
                    note: note.trim() || undefined
                  });
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success(`${stageLabel} 발송 완료로 기록했습니다`);
                    setOpen(false);
                  }
                })
              }
            >
              {pending ? '저장 중...' : '발송 완료'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
