'use client';

import { Fragment, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Icons } from '@/components/icons';
import { Checkbox } from '@/components/ui/checkbox';
import { updateSession, deleteSession, deleteSessions } from '../_actions';

type AttendanceRecord = {
  status: string;
  students: { name: string } | { name: string }[] | null;
};

type Session = {
  id: string;
  session_date: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  attendance_records: AttendanceRecord[];
};

function getStudentName(students: AttendanceRecord['students']): string {
  if (!students) return '';
  if (Array.isArray(students)) return students[0]?.name ?? '';
  return students.name;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(`${dateStr}T00:00:00`);
  const dow = DOW[date.getDay()];
  return `${y}. ${Number(m)}. ${Number(d)}. (${dow})`;
}

function StatusCell({ count, names, className }: { count: number; names: string[]; className?: string }) {
  if (count === 0) return <span className='text-muted-foreground'>-</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`cursor-default font-medium underline decoration-dotted ${className}`}>
          {count}
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-48'>
        <p className='text-xs leading-relaxed'>{names.join(', ')}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function SessionList({
  cohortId,
  sessions,
  pastStartIndex = sessions.length
}: {
  cohortId: string;
  sessions: Session[];
  pastStartIndex?: number;
}) {
  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const allIds = sessions.map((s) => s.id);
  const isAllSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const isIndeterminate = selected.size > 0 && !isAllSelected;

  const toggleAll = () => {
    setSelected(isAllSelected ? new Set() : new Set(allIds));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const onBulkDelete = () => {
    setBulkDeleteError(null);
    startTransition(async () => {
      const result = await deleteSessions([...selected], cohortId);
      if (result?.error) { setBulkDeleteError(result.error); return; }
      setSelected(new Set());
      setBulkDeleteOpen(false);
      router.refresh();
    });
  };

  const onUpdate = (formData: FormData) => {
    if (!editTarget) return;
    setEditError(null);
    startTransition(async () => {
      const result = await updateSession(editTarget.id, cohortId, formData);
      if (result?.error) { setEditError(result.error); return; }
      setEditTarget(null);
      router.refresh();
    });
  };

  const onDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteSession(deleteTarget.id, cohortId);
      if (result?.error) { setDeleteError(result.error); return; }
      setDeleteTarget(null);
      router.refresh();
    });
  };

  return (
    <>
      {/* 선택 삭제 툴바 */}
      {selected.size > 0 && (
        <div className='bg-muted/60 mb-2 flex items-center justify-between rounded-md border px-4 py-2'>
          <span className='text-sm'>{selected.size}개 선택됨</span>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => { setBulkDeleteError(null); setBulkDeleteOpen(true); }}
          >
            선택 삭제
          </Button>
        </div>
      )}

      <div className='overflow-x-auto rounded-md border'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='bg-muted/50 border-b'>
              <th className='w-10 px-4 py-3'>
                <Checkbox
                  checked={isAllSelected}
                  data-indeterminate={isIndeterminate}
                  onCheckedChange={toggleAll}
                  aria-label='전체 선택'
                  className={isIndeterminate ? 'opacity-60' : ''}
                />
              </th>
              <th className='whitespace-nowrap px-4 py-3 text-left font-medium'>날짜</th>
              <th className='px-4 py-3 text-left font-medium'>제목</th>
              <th className='whitespace-nowrap px-4 py-3 text-left font-medium'>수업 시간</th>
              <th className='whitespace-nowrap px-4 py-3 text-center font-medium'>출석</th>
              <th className='whitespace-nowrap px-4 py-3 text-center font-medium'>결석</th>
              <th className='whitespace-nowrap px-4 py-3 text-center font-medium'>지각</th>
              <th className='whitespace-nowrap px-4 py-3 text-center font-medium'>조퇴</th>
              <th className='whitespace-nowrap px-4 py-3 text-center font-medium'>공결</th>
              <th className='w-16 px-4 py-3'></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => {
              const records = s.attendance_records ?? [];
              const byStatus = (status: string) =>
                records.filter((r) => r.status === status).map((r) => getStudentName(r.students)).filter(Boolean);
              const present = byStatus('present');
              const absent = byStatus('absent');
              const late = byStatus('late');
              const earlyLeave = byStatus('early_leave');
              const excused = byStatus('excused');
              const total = records.length;
              const breakMin = s.break_minutes ?? 0;
              let timeLabel = '-';
              let hoursLabel = '';
              if (s.start_time && s.end_time) {
                const [sh, sm] = s.start_time.split(':').map(Number);
                const [eh, em] = s.end_time.split(':').map(Number);
                const totalMin = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
                const hours = Math.floor(totalMin / 60);
                const mins = totalMin % 60;
                hoursLabel = mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
                timeLabel = `${s.start_time.slice(0, 5)} ~ ${s.end_time.slice(0, 5)}`;
              }

              return (
              <Fragment key={s.id}>
                {i === pastStartIndex && pastStartIndex > 0 && pastStartIndex < sessions.length && (
                  <tr>
                    <td colSpan={9} className='px-4 py-2'>
                      <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                        <div className='bg-border h-px flex-1' />
                        <span>지난 수업</span>
                        <div className='bg-border h-px flex-1' />
                      </div>
                    </td>
                  </tr>
                )}
                <tr className={`hover:bg-muted/30 group border-b transition-colors last:border-0 ${selected.has(s.id) ? 'bg-muted/40' : ''}`}>
                  <td className='px-4 py-3'>
                    <Checkbox
                      checked={selected.has(s.id)}
                      onCheckedChange={() => toggleOne(s.id)}
                      aria-label={`${formatDate(s.session_date)} 선택`}
                    />
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-2'>
                      {total === 0 && (
                        <span className='h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30' title='미입력' />
                      )}
                      {total > 0 && absent.length === 0 && (
                        <span className='h-2 w-2 shrink-0 rounded-full bg-emerald-500' title='전원 출석' />
                      )}
                      {total > 0 && absent.length > 0 && (
                        <span className='h-2 w-2 shrink-0 rounded-full bg-amber-500' title='결석 있음' />
                      )}
                      <Link href={`/dashboard/cohorts/${cohortId}/attendance/${s.id}`} className='font-medium hover:underline'>
                        {formatDate(s.session_date)}
                      </Link>
                    </div>
                  </td>
                  <td className='text-muted-foreground px-4 py-3'>{s.title ?? '-'}</td>
                  <td className='whitespace-nowrap px-4 py-3 text-xs'>
                    <span className='text-muted-foreground'>{timeLabel}</span>
                    {hoursLabel && <span className='text-foreground ml-1.5 font-medium'>({hoursLabel})</span>}
                  </td>
                  <td className='px-4 py-3 text-center'>
                    {total > 0 ? <StatusCell count={present.length} names={present} className='text-green-600' /> : <span className='text-muted-foreground'>-</span>}
                  </td>
                  <td className='px-4 py-3 text-center'>
                    {total > 0 ? <StatusCell count={absent.length} names={absent} className={absent.length > 0 ? 'text-destructive' : 'text-muted-foreground'} /> : <span className='text-muted-foreground'>-</span>}
                  </td>
                  <td className='px-4 py-3 text-center'>
                    {total > 0 ? <StatusCell count={late.length} names={late} className={late.length > 0 ? 'text-orange-500' : 'text-muted-foreground'} /> : <span className='text-muted-foreground'>-</span>}
                  </td>
                  <td className='px-4 py-3 text-center'>
                    {total > 0 ? <StatusCell count={earlyLeave.length} names={earlyLeave} className={earlyLeave.length > 0 ? 'text-amber-500' : 'text-muted-foreground'} /> : <span className='text-muted-foreground'>-</span>}
                  </td>
                  <td className='px-4 py-3 text-center'>
                    {total > 0 ? <StatusCell count={excused.length} names={excused} className='text-muted-foreground' /> : <span className='text-muted-foreground'>-</span>}
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                      <Button variant='ghost' size='icon' className='h-7 w-7' onClick={() => { setEditError(null); setEditTarget(s); }}>
                        <Icons.edit className='h-3.5 w-3.5' />
                      </Button>
                      <Button variant='ghost' size='icon' className='text-destructive hover:text-destructive h-7 w-7' onClick={() => { setDeleteError(null); setDeleteTarget(s); }}>
                        <Icons.trash className='h-3.5 w-3.5' />
                      </Button>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
          </tbody>
        </table>
      </div>

      {/* 수정 Sheet */}
      <Sheet open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>수업 수정</SheetTitle>
          </SheetHeader>
          <form action={onUpdate} className='grid gap-4 px-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='edit-date'>수업 날짜 *</Label>
              <Input id='edit-date' name='session_date' type='date' required defaultValue={editTarget?.session_date ?? ''} key={editTarget?.id + '-date'} />
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='grid gap-2'>
                <Label htmlFor='edit-start'>시작 시간</Label>
                <Input id='edit-start' name='start_time' type='time' defaultValue={editTarget?.start_time?.slice(0, 5) ?? ''} key={editTarget?.id + '-start'} />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='edit-end'>종료 시간</Label>
                <Input id='edit-end' name='end_time' type='time' defaultValue={editTarget?.end_time?.slice(0, 5) ?? ''} key={editTarget?.id + '-end'} />
              </div>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='edit-break'>휴식 시간 (분)</Label>
              <Input id='edit-break' name='break_minutes' type='number' min='0' step='10'
                defaultValue={editTarget?.break_minutes ?? 60} key={editTarget?.id + '-break'} />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='edit-title'>제목 (선택)</Label>
              <Input id='edit-title' name='title' defaultValue={editTarget?.title ?? ''} key={editTarget?.id + '-title'} />
            </div>
            {editError && <div className='text-destructive text-sm'>{editError}</div>}
            <SheetFooter>
              <Button type='submit' disabled={pending}>{pending ? '저장 중...' : '저장'}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* 선택 삭제 확인 */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 수업 <strong>{selected.size}개</strong>를 삭제하시겠습니까?
              {' '}입력된 출결 기록도 함께 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkDeleteError && <div className='text-destructive text-sm px-1'>{bulkDeleteError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={onBulkDelete} disabled={pending} className='bg-destructive hover:bg-destructive/90 text-white'>
              {pending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 단건 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수업 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget ? formatDate(deleteTarget.session_date) : ''}</strong> 수업을 삭제하시겠습니까?
              {' '}입력된 출결 기록도 함께 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <div className='text-destructive text-sm px-1'>{deleteError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} disabled={pending} className='bg-destructive hover:bg-destructive/90 text-white'>
              {pending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
