'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '../_actions';

export type ManagedEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  category: string | null;
  capacity: number | null;
  notes: string | null;
};

const CATEGORIES = ['인증평가', '사전접속테스트', '교육', '기타'] as const;

const CATEGORY_TONE: Record<string, string> = {
  인증평가: 'border-rose-200 bg-rose-50 text-rose-700',
  사전접속테스트: 'border-teal-200 bg-teal-50 text-teal-700',
  교육: 'border-blue-200 bg-blue-50 text-blue-700',
  기타: 'border-slate-200 bg-slate-50 text-slate-600'
};

function EventForm({ event, onDone }: { event?: ManagedEvent; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isEdit = !!event;

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = isEdit
        ? await updateCalendarEvent(event.id, formData)
        : await createCalendarEvent(formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      onDone();
    });
  };

  return (
    <form action={onSubmit} className='bg-muted/40 grid gap-3 rounded-lg border p-3'>
      <div className='grid gap-2 sm:grid-cols-2'>
        <div className='grid gap-1.5'>
          <Label htmlFor='title' className='text-xs'>
            일정명 *
          </Label>
          <Input
            id='title'
            name='title'
            required
            defaultValue={event?.title ?? ''}
            placeholder='예: 그린(초급) 인증평가 11월'
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='category' className='text-xs'>
            유형
          </Label>
          <select
            id='category'
            name='category'
            defaultValue={event?.category ?? '인증평가'}
            className='border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none'
          >
            <option value=''>미지정</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className='grid gap-2 sm:grid-cols-3'>
        <div className='grid gap-1.5'>
          <Label htmlFor='event_date' className='text-xs'>
            날짜 *
          </Label>
          <Input
            id='event_date'
            name='event_date'
            type='date'
            required
            defaultValue={event?.event_date ?? ''}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='event_time' className='text-xs'>
            시각
          </Label>
          <Input
            id='event_time'
            name='event_time'
            type='time'
            defaultValue={event?.event_time?.slice(0, 5) ?? ''}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='capacity' className='text-xs'>
            정원
          </Label>
          <Input
            id='capacity'
            name='capacity'
            type='number'
            min={0}
            defaultValue={event?.capacity ?? ''}
            placeholder='예: 100'
          />
        </div>
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='notes' className='text-xs'>
          비고
        </Label>
        <Input id='notes' name='notes' defaultValue={event?.notes ?? ''} />
      </div>
      {error && <p className='text-destructive text-sm'>{error}</p>}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='ghost' size='sm' onClick={onDone} disabled={pending}>
          취소
        </Button>
        <Button type='submit' size='sm' disabled={pending}>
          {pending ? '저장 중…' : isEdit ? '저장' : '추가'}
        </Button>
      </div>
    </form>
  );
}

function EventRow({ event }: { event: ManagedEvent }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (editing) return <EventForm event={event} onDone={() => setEditing(false)} />;

  const onDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteCalendarEvent(event.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className='hover:bg-muted/40 flex items-start gap-3 rounded-lg border px-3 py-2'>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm font-medium tabular-nums'>
            {event.event_date}
            {event.event_time && (
              <span className='text-muted-foreground ml-1 font-normal'>
                {event.event_time.slice(0, 5)}
              </span>
            )}
          </span>
          {event.category && (
            <Badge
              variant='outline'
              className={cn('font-normal', CATEGORY_TONE[event.category] ?? CATEGORY_TONE.기타)}
            >
              {event.category}
            </Badge>
          )}
          {event.capacity !== null && (
            <span className='text-muted-foreground text-xs'>정원 {event.capacity}</span>
          )}
        </div>
        <p className='mt-0.5 truncate text-sm'>{event.title}</p>
        {event.notes && (
          <p className='text-muted-foreground mt-0.5 truncate text-xs'>{event.notes}</p>
        )}
        {error && <p className='text-destructive mt-1 text-xs'>{error}</p>}
      </div>
      <div className='flex shrink-0 gap-1'>
        <Button variant='ghost' size='sm' onClick={() => setEditing(true)} disabled={pending}>
          수정
        </Button>
        <Button
          variant='ghost'
          size='sm'
          className='text-destructive hover:text-destructive'
          onClick={onDelete}
          disabled={pending}
        >
          삭제
        </Button>
      </div>
    </div>
  );
}

export function CalendarEventManager({ events }: { events: ManagedEvent[] }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const sorted = events.toSorted((a, b) => a.event_date.localeCompare(b.event_date));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = sorted.filter((e) => e.event_date >= today);
  const past = sorted.filter((e) => e.event_date < today).toReversed();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant='outline' size='sm'>
          <Icons.calendar className='mr-1.5' />
          일정 관리
        </Button>
      </SheetTrigger>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>캘린더 일정 관리</SheetTitle>
          <SheetDescription>
            기수와 무관한 독립 일정(인증평가·사전접속테스트 등)을 추가·수정합니다. 기수 자체의
            교육·모집 일정은 각 기수 설정에서 관리합니다.
          </SheetDescription>
        </SheetHeader>

        <div className='grid gap-3 px-4 pb-6'>
          {adding ? (
            <EventForm onDone={() => setAdding(false)} />
          ) : (
            <Button size='sm' onClick={() => setAdding(true)}>
              <Icons.add className='mr-1.5' />
              일정 추가
            </Button>
          )}

          {upcoming.length > 0 && (
            <div className='grid gap-2'>
              <p className='text-muted-foreground text-xs font-medium'>예정 {upcoming.length}건</p>
              {upcoming.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className='grid gap-2'>
              <p className='text-muted-foreground text-xs font-medium'>지난 {past.length}건</p>
              {past.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          )}

          {events.length === 0 && (
            <p className='text-muted-foreground py-8 text-center text-sm'>
              등록된 독립 일정이 없습니다.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
