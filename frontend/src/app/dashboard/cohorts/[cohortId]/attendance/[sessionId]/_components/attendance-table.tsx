'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  classifyOrganization,
  ORGANIZATION_CATEGORY_LABEL,
  type OrganizationCategory
} from '@/lib/organization-category';
import { saveAttendance } from '../_actions';

const CATEGORY_CLASS: Record<OrganizationCategory, string> = {
  central: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  basic_local: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  metro_local: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
  public: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  education: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  unknown: 'border-border bg-muted text-muted-foreground'
};

const STATUS_OPTIONS = [
  { value: 'none', label: '-' },
  { value: 'present', label: '출석' },
  { value: 'absent', label: '결석' },
  { value: 'late', label: '지각' },
  { value: 'early_leave', label: '조퇴' },
  { value: 'excused', label: '공결' }
] as const;

const STATUS_CLASS: Record<string, string> = {
  none: 'text-muted-foreground',
  present: 'text-green-600',
  absent: 'text-destructive',
  late: 'text-orange-500',
  early_leave: 'text-amber-500',
  excused: 'text-muted-foreground'
};

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcCreditedHours(
  status: string,
  sessionStart: string | null,
  sessionEnd: string | null,
  breakMinutes: number,
  arrivalTime: string,
  departureTime: string
): number | null {
  if (!sessionStart || !sessionEnd) return null;
  if (status === 'none') return null;
  const round = (min: number) => Math.round((Math.max(0, min) / 60) * 10) / 10;
  const totalMin = toMinutes(sessionEnd) - toMinutes(sessionStart) - breakMinutes;
  if (status === 'present') return round(totalMin);
  if (status === 'absent' || status === 'excused') return 0;
  if (status === 'late' && arrivalTime) {
    return round(toMinutes(sessionEnd) - toMinutes(arrivalTime) - breakMinutes);
  }
  if (status === 'early_leave' && departureTime) {
    return round(toMinutes(departureTime) - toMinutes(sessionStart) - breakMinutes);
  }
  return null;
}

type Student = {
  id: string;
  name: string;
  organizations: { name: string }[] | { name: string } | null;
};

type RecordMap = Record<string, {
  status: string;
  note: string | null;
  arrival_time: string | null;
  departure_time: string | null;
  credited_hours: number | null;
}>;

function getOrgName(org: Student['organizations']): string {
  if (!org) return '-';
  if (Array.isArray(org)) return org[0]?.name ?? '-';
  return org.name;
}

interface AttendanceTableProps {
  sessionId: string;
  cohortId: string;
  students: Student[];
  recordMap: RecordMap;
  sessionStartTime: string | null;
  sessionEndTime: string | null;
  breakMinutes: number;
}

export function AttendanceTable({
  sessionId,
  cohortId,
  students,
  recordMap,
  sessionStartTime,
  sessionEndTime,
  breakMinutes
}: AttendanceTableProps) {
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.status ?? 'none']))
  );
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.note ?? '']))
  );
  const [arrivalTimes, setArrivalTimes] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.arrival_time?.slice(0, 5) ?? '']))
  );
  const [departureTimes, setDepartureTimes] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.departure_time?.slice(0, 5) ?? '']))
  );

  const [filter, setFilter] = useState<string>('all');
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleMarkAllPresent = () => {
    setStatuses(Object.fromEntries(students.map((s) => [s.id, 'present'])));
    setSaved(false);
  };

  const handleSave = () => {
    setSaveError(null);
    setSaved(false);
    startTransition(async () => {
      const records = students.filter((s) => statuses[s.id] && statuses[s.id] !== 'none').map((s) => {
        const status = statuses[s.id];
        const arrivalTime = arrivalTimes[s.id] || null;
        const departureTime = departureTimes[s.id] || null;
        const credited = calcCreditedHours(status, sessionStartTime, sessionEndTime, breakMinutes, arrivalTimes[s.id], departureTimes[s.id]);
        return {
          student_id: s.id,
          status,
          note: notes[s.id] || null,
          arrival_time: status === 'late' ? arrivalTime : null,
          departure_time: status === 'early_leave' ? departureTime : null,
          credited_hours: credited
        };
      });
      const result = await saveAttendance(sessionId, cohortId, records);
      if (result?.error) { setSaveError(result.error); } else { setSaved(true); }
    });
  };

  const counts = Object.values(statuses).reduce((acc, s) => {
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const hasTime = !!(sessionStartTime && sessionEndTime);

  const filteredStudents = filter === 'all'
    ? students
    : students.filter((s) => statuses[s.id] === filter);

  const FILTERS = [
    { value: 'all', label: '전체', count: students.length, className: 'text-foreground' },
    { value: 'present', label: '출석', count: counts['present'] ?? 0, className: 'text-green-600' },
    { value: 'absent', label: '결석', count: counts['absent'] ?? 0, className: 'text-destructive' },
    { value: 'late', label: '지각', count: counts['late'] ?? 0, className: 'text-orange-500' },
    { value: 'early_leave', label: '조퇴', count: counts['early_leave'] ?? 0, className: 'text-amber-500' },
    { value: 'excused', label: '공결', count: counts['excused'] ?? 0, className: 'text-muted-foreground' }
  ];

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        {/* 필터 탭 */}
        <div className='flex gap-1'>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-muted ' + f.className
                  : 'text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {f.label}
              <span className='ml-1.5 text-xs opacity-70'>{f.count}</span>
            </button>
          ))}
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={handleMarkAllPresent} disabled={pending}>
            전체 출석
          </Button>
          {saveError && <span className='text-destructive text-sm'>{saveError}</span>}
          {saved && <span className='text-sm text-green-600'>저장 완료</span>}
          <Button onClick={handleSave} disabled={pending}>
            {pending ? '저장 중...' : '전체 저장'}
          </Button>
        </div>
      </div>

      <div className='overflow-x-auto rounded-md border'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='bg-muted/50 border-b'>
              <th className='whitespace-nowrap px-4 py-3 text-left font-medium'>이름</th>
              <th className='whitespace-nowrap px-4 py-3 text-left font-medium'>소속</th>
              <th className='w-28 whitespace-nowrap px-4 py-3 text-left font-medium'>출결</th>
              <th className='w-28 whitespace-nowrap px-4 py-3 text-left font-medium'>
                {hasTime ? '도착 / 퇴장' : '시간'}
              </th>
              {hasTime && (
                <th className='w-20 whitespace-nowrap px-4 py-3 text-center font-medium'>인정시간</th>
              )}
              <th className='whitespace-nowrap px-4 py-3 text-left font-medium'>비고</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s) => {
              const status = statuses[s.id] ?? 'none';
              const credited = calcCreditedHours(
                status, sessionStartTime, sessionEndTime,
                breakMinutes, arrivalTimes[s.id], departureTimes[s.id]
              );

              return (
                <tr key={s.id} className='border-b last:border-0'>
                  <td className='px-4 py-2 font-medium'>{s.name}</td>
                  <td className='px-4 py-2'>
                    {(() => {
                      const orgName = getOrgName(s.organizations);
                      const category = classifyOrganization(orgName);
                      return (
                        <div className='flex min-w-0 items-center gap-2'>
                          <Badge variant='outline' className={`shrink-0 ${CATEGORY_CLASS[category]}`}>
                            {ORGANIZATION_CATEGORY_LABEL[category]}
                          </Badge>
                          <span className='text-muted-foreground truncate'>{orgName}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className='px-4 py-2'>
                    <Select
                      value={status}
                      onValueChange={(v) => {
                        setStatuses((prev) => ({ ...prev, [s.id]: v }));
                        setSaved(false);
                      }}
                    >
                      <SelectTrigger className={`w-24 ${STATUS_CLASS[status] ?? ''}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className='px-4 py-2'>
                    {status === 'late' && (
                      <Input
                        type='time'
                        placeholder='도착 시간'
                        value={arrivalTimes[s.id]}
                        onChange={(e) => {
                          setArrivalTimes((prev) => ({ ...prev, [s.id]: e.target.value }));
                          setSaved(false);
                        }}
                        className='h-8 w-28 text-sm text-orange-500'
                      />
                    )}
                    {status === 'early_leave' && (
                      <Input
                        type='time'
                        placeholder='퇴장 시간'
                        value={departureTimes[s.id]}
                        onChange={(e) => {
                          setDepartureTimes((prev) => ({ ...prev, [s.id]: e.target.value }));
                          setSaved(false);
                        }}
                        className='h-8 w-28 text-sm text-amber-500'
                      />
                    )}
                    {status !== 'late' && status !== 'early_leave' && (
                      <span className='text-muted-foreground'>-</span>
                    )}
                  </td>
                  {hasTime && (
                    <td className='px-4 py-2 text-center'>
                      {credited !== null ? (
                        <span className={credited > 0 ? 'font-medium' : 'text-muted-foreground'}>
                          {credited}h
                        </span>
                      ) : (
                        <span className='text-muted-foreground'>-</span>
                      )}
                    </td>
                  )}
                  <td className='px-4 py-2'>
                    <Input
                      placeholder='비고'
                      value={notes[s.id]}
                      onChange={(e) => {
                        setNotes((prev) => ({ ...prev, [s.id]: e.target.value }));
                        setSaved(false);
                      }}
                      className='h-8 text-sm'
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className='flex justify-end gap-2'>
        {saveError && <span className='text-destructive text-sm'>{saveError}</span>}
        {saved && <span className='text-sm text-green-600'>저장 완료</span>}
        <Button onClick={handleSave} disabled={pending}>
          {pending ? '저장 중...' : '전체 저장'}
        </Button>
      </div>
    </div>
  );
}
