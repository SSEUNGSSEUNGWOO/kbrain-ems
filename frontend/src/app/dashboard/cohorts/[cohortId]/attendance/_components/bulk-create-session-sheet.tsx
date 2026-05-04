'use client';

import { useMemo, useState, useTransition } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { createSessions } from '../_actions';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function getDatesInRange(start: string, end: string, days: number[]): string[] {
  if (!start || !end || days.length === 0) return [];
  const result: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  if (cur > endDate) return [];
  while (cur <= endDate) {
    if (days.includes(cur.getDay())) {
      result.push(cur.toISOString().split('T')[0]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function buildTitles(dates: string[], pattern: string): (string | null)[] {
  if (pattern === 'none') return dates.map(() => null);
  if (pattern === 'day') return dates.map((_, i) => `${i + 1}일차`);
  if (pattern === 'week') {
    // 첫 날짜 기준 몇 번째 주인지 계산
    const base = new Date(dates[0] + 'T00:00:00');
    return dates.map((d) => {
      const diff = Math.floor(
        (new Date(d + 'T00:00:00').getTime() - base.getTime()) / (7 * 86400000)
      );
      return `${diff + 1}주차`;
    });
  }
  return dates.map(() => null);
}

function formatPreviewDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

export function BulkCreateSessionSheet({ cohortId }: { cohortId: string }) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // 월~금 기본
  const [titlePattern, setTitlePattern] = useState<string>('day');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dates = useMemo(
    () => getDatesInRange(startDate, endDate, selectedDays),
    [startDate, endDate, selectedDays]
  );

  const titles = useMemo(() => buildTitles(dates, titlePattern), [dates, titlePattern]);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSubmit = () => {
    setError(null);
    if (dates.length === 0) { setError('추가할 수업 날짜가 없습니다.'); return; }
    startTransition(async () => {
      const sessions = dates.map((date, i) => ({
        session_date: date,
        title: titles[i],
        start_time: startTime || null,
        end_time: endTime || null,
        break_minutes: breakMinutes
      }));
      const result = await createSessions(cohortId, sessions);
      if (result?.error) { setError(result.error); return; }
      setOpen(false);
      setStartDate(''); setEndDate('');
      router.refresh();
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant='outline'>일괄 추가</Button>
      </SheetTrigger>
      <SheetContent className='overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>수업 일괄 추가</SheetTitle>
          <SheetDescription>날짜 범위와 요일을 선택하면 수업을 한 번에 등록합니다.</SheetDescription>
        </SheetHeader>
        <div className='grid gap-5 px-4 py-4'>
          <div className='grid gap-2'>
            <Label>시작일</Label>
            <Input type='date' value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className='grid gap-2'>
            <Label>종료일</Label>
            <Input type='date' value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-2'>
              <Label>수업 시작 시간</Label>
              <Input type='time' value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className='grid gap-2'>
              <Label>수업 종료 시간</Label>
              <Input type='time' value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className='grid gap-2'>
            <Label>휴식 시간 (분)</Label>
            <Input
              type='number'
              min='0'
              step='10'
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
          <div className='grid gap-2'>
            <Label>수업 요일</Label>
            <div className='flex gap-2'>
              {WEEKDAYS.map((label, idx) => (
                <button
                  key={idx}
                  type='button'
                  onClick={() => toggleDay(idx)}
                  className={`h-8 w-8 rounded-full text-xs font-medium transition-colors ${
                    selectedDays.includes(idx)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className='grid gap-2'>
            <Label>제목 패턴</Label>
            <Select value={titlePattern} onValueChange={setTitlePattern}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>제목 없음</SelectItem>
                <SelectItem value='day'>1일차, 2일차...</SelectItem>
                <SelectItem value='week'>1주차, 2주차...</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 미리보기 */}
          <div className='grid gap-2'>
            <Label>
              미리보기
              {dates.length > 0 && (
                <span className='text-muted-foreground ml-2 font-normal'>총 {dates.length}회</span>
              )}
            </Label>
            {dates.length === 0 ? (
              <div className='text-muted-foreground rounded-md border p-3 text-xs'>
                날짜 범위와 요일을 선택하면 수업 목록이 표시됩니다.
              </div>
            ) : (
              <div className='max-h-48 overflow-y-auto rounded-md border p-3'>
                <div className='grid gap-1'>
                  {dates.map((d, i) => (
                    <div key={d} className='flex items-center gap-2 text-xs'>
                      <span className='text-muted-foreground w-20'>{formatPreviewDate(d)}</span>
                      {titles[i] && (
                        <span className='text-muted-foreground'>{titles[i]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <div className='text-destructive text-sm'>{error}</div>}
        </div>
        <SheetFooter className='px-4'>
          <Button onClick={handleSubmit} disabled={pending || dates.length === 0}>
            {pending ? '추가 중...' : `${dates.length}개 수업 추가`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
