'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import {
  markStageSent,
  unmarkStageSent,
  type DispatchChannel
} from '../_actions';
import type { DispatchTemplate } from '@/lib/dispatch-stages';

type Props = {
  cohortId: string;
  template: DispatchTemplate;
  stageLabel: string;
  // 이미 발송된 row가 있으면 취소용 id
  sentNotificationId?: string | null;
};

const CHANNEL_OPTIONS: { value: DispatchChannel; label: string }[] = [
  { value: 'email', label: '메일' },
  { value: 'sms', label: 'SMS' }
];

export function StageActionPopover({ cohortId, template, stageLabel, sentNotificationId }: Props) {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<DispatchChannel[]>(['email', 'sms']);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();

  const toggle = (c: DispatchChannel) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  if (sentNotificationId) {
    return (
      <Button
        variant='ghost'
        size='sm'
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await unmarkStageSent(sentNotificationId, cohortId);
            if (!res.ok) toast.error(res.error);
            else toast.success(`${stageLabel} 발송 기록을 취소했습니다`);
          })
        }
      >
        <Icons.close className='size-4' /> 취소
      </Button>
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
            <div className='text-muted-foreground text-xs'>발송한 채널과 비고를 기록합니다.</div>
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
                  const res = await markStageSent({
                    cohortId,
                    template,
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
