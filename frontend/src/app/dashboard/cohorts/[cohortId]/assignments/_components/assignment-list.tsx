'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Icons } from '@/components/icons';
import { updateAssignment, deleteAssignment, deleteAssignments } from '../_actions';

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  assignment_submissions: { status: string }[];
};

function StatusBadge({ count, total }: { count: number; total: number }) {
  const color = count === total ? 'text-green-600' : count > 0 ? 'text-orange-500' : 'text-muted-foreground';
  return <span className={`font-medium ${color}`}>{count} / {total}명 제출</span>;
}

export function AssignmentList({ cohortId, assignments, studentCount }: {
  cohortId: string;
  assignments: Assignment[];
  studentCount: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<Assignment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const allIds = assignments.map((a) => a.id);
  const isAllSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const isIndeterminate = selected.size > 0 && !isAllSelected;
  const toggleAll = () => setSelected(isAllSelected ? new Set() : new Set(allIds));
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });

  const onUpdate = (formData: FormData) => {
    if (!editTarget) return;
    setEditError(null);
    startTransition(async () => {
      const result = await updateAssignment(editTarget.id, cohortId, formData);
      if (result?.error) { setEditError(result.error); return; }
      setEditTarget(null);
      router.refresh();
    });
  };

  const onDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteAssignment(deleteTarget.id, cohortId);
      if (result?.error) { setDeleteError(result.error); return; }
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const onBulkDelete = () => {
    setBulkError(null);
    startTransition(async () => {
      const result = await deleteAssignments([...selected], cohortId);
      if (result?.error) { setBulkError(result.error); return; }
      setSelected(new Set());
      setBulkDeleteOpen(false);
      router.refresh();
    });
  };

  if (assignments.length === 0) {
    return (
      <div className='text-muted-foreground rounded-md border p-8 text-center'>
        등록된 과제가 없습니다.
      </div>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <div className='bg-muted/60 mb-2 flex items-center justify-between rounded-md border px-4 py-2'>
          <span className='text-sm'>{selected.size}개 선택됨</span>
          <Button variant='destructive' size='sm' onClick={() => { setBulkError(null); setBulkDeleteOpen(true); }}>
            선택 삭제
          </Button>
        </div>
      )}

      <div className='overflow-x-auto rounded-md border'>
        <table className='w-full min-w-[820px] table-fixed text-sm'>
          <thead>
            <tr className='bg-muted/50 border-b'>
              <th className='w-10 px-4 py-3'>
                <Checkbox checked={isAllSelected} data-indeterminate={isIndeterminate}
                  onCheckedChange={toggleAll} className={isIndeterminate ? 'opacity-60' : ''} />
              </th>
              <th className='w-56 px-4 py-3 text-left font-medium'>과제명</th>
              <th className='px-4 py-3 text-left font-medium'>과제내용</th>
              <th className='w-32 whitespace-nowrap px-4 py-3 text-left font-medium'>제출기한</th>
              <th className='w-36 whitespace-nowrap px-4 py-3 text-left font-medium'>제출현황</th>
              <th className='w-16 px-4 py-3'></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => {
              const submitted = a.assignment_submissions.filter(
                (s) => s.status === 'submitted' || s.status === 'late'
              ).length;
              return (
                <tr key={a.id} className={`group border-b transition-colors last:border-0 hover:bg-muted/30 ${selected.has(a.id) ? 'bg-muted/40' : ''}`}>
                  <td className='px-4 py-3'>
                    <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleOne(a.id)} />
                  </td>
                  <td className='px-4 py-3'>
                    <Link href={`/dashboard/cohorts/${cohortId}/assignments/${a.id}`} className='font-medium hover:underline'>
                      {a.title}
                    </Link>
                  </td>
                  <td className='text-muted-foreground truncate px-4 py-3'>{a.description ?? '-'}</td>
                  <td className='text-muted-foreground whitespace-nowrap px-4 py-3'>{a.due_date ?? '-'}</td>
                  <td className='whitespace-nowrap px-4 py-3'>
                    <StatusBadge count={submitted} total={studentCount} />
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                      <Button variant='ghost' size='icon' className='h-7 w-7'
                        onClick={() => { setEditError(null); setEditTarget(a); }}>
                        <Icons.edit className='h-3.5 w-3.5' />
                      </Button>
                      <Button variant='ghost' size='icon' className='text-destructive hover:text-destructive h-7 w-7'
                        onClick={() => { setDeleteError(null); setDeleteTarget(a); }}>
                        <Icons.trash className='h-3.5 w-3.5' />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 수정 Sheet */}
      <Sheet open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <SheetContent>
          <SheetHeader><SheetTitle>과제 수정</SheetTitle></SheetHeader>
          <form action={onUpdate} className='grid gap-4 px-4 py-4'>
            <div className='grid gap-2'>
              <Label>과제명 *</Label>
              <Input name='title' required defaultValue={editTarget?.title ?? ''} key={editTarget?.id + '-t'} />
            </div>
            <div className='grid gap-2'>
              <Label>설명 (선택)</Label>
              <Input name='description' defaultValue={editTarget?.description ?? ''} key={editTarget?.id + '-d'} />
            </div>
            <div className='grid gap-2'>
              <Label>제출 기한 (선택)</Label>
              <Input name='due_date' type='date' defaultValue={editTarget?.due_date ?? ''} key={editTarget?.id + '-dt'} />
            </div>
            {editError && <div className='text-destructive text-sm'>{editError}</div>}
            <SheetFooter>
              <Button type='submit' disabled={pending}>{pending ? '저장 중...' : '저장'}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* 단건 삭제 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>과제 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.title}</strong>을(를) 삭제하시겠습니까? 제출 기록도 함께 삭제됩니다.
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

      {/* 선택 삭제 */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              과제 <strong>{selected.size}개</strong>를 삭제하시겠습니까? 제출 기록도 함께 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkError && <div className='text-destructive text-sm px-1'>{bulkError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={onBulkDelete} disabled={pending} className='bg-destructive hover:bg-destructive/90 text-white'>
              {pending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
