'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { deleteApplicant, deleteApplicants } from '../_actions';
import { ApplicantSheet, type Applicant } from './applicant-sheet';

type ApplicantRow = Applicant & {
  applicationCount: number;
  selectedCount: number;
};

const STATUS_BADGE_CLASS =
  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300';

export function ApplicantTable({ applicants }: { applicants: ApplicantRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ApplicantRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { isDeveloper } = useAuth();

  const visibleIds = applicants.map((a) => a.id);
  const visibleSelectedCount = visibleIds.filter((id) => selected.has(id)).length;
  const isAllSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const isIndeterminate = visibleSelectedCount > 0 && !isAllSelected;

  const toggleAll = () =>
    setSelected((prev) => {
      if (isAllSelected) {
        return new Set([...prev].filter((id) => !visibleIds.includes(id)));
      }
      return new Set([...prev, ...visibleIds]);
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const onDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteApplicant(deleteTarget.id);
      if (result?.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const onBulkDelete = () => {
    setBulkDeleteError(null);
    startTransition(async () => {
      const result = await deleteApplicants([...selected]);
      if (result?.error) {
        setBulkDeleteError(result.error);
        return;
      }
      setSelected(new Set());
      setBulkDeleteOpen(false);
      router.refresh();
    });
  };

  if (applicants.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
        <div className='mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40'>
          <Icons.teams className='h-6 w-6 text-blue-500' />
        </div>
        <p className='text-foreground mb-1 font-medium'>등록된 지원자가 없습니다</p>
        <p className='text-muted-foreground text-sm'>
          우측 상단에서 지원자를 추가해주세요.
        </p>
      </div>
    );
  }

  return (
    <>
      {isDeveloper && selected.size > 0 && (
        <div className='bg-muted/60 mb-2 flex items-center justify-between rounded-md border px-4 py-2'>
          <span className='text-sm'>{selected.size}명 선택됨</span>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => {
              setBulkDeleteError(null);
              setBulkDeleteOpen(true);
            }}
          >
            선택 삭제
          </Button>
        </div>
      )}

      <div className='rounded-md border'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='bg-muted/50 border-b'>
              {isDeveloper && (
                <th className='w-10 px-4 py-3'>
                  <Checkbox
                    checked={isAllSelected}
                    data-indeterminate={isIndeterminate}
                    onCheckedChange={toggleAll}
                    aria-label='전체 선택'
                    className={isIndeterminate ? 'opacity-60' : ''}
                  />
                </th>
              )}
              <th className='px-4 py-3 text-left font-medium'>이름</th>
              <th className='px-4 py-3 text-left font-medium'>구분</th>
              <th className='px-4 py-3 text-left font-medium'>소속</th>
              <th className='px-4 py-3 text-left font-medium'>직책</th>
              <th className='px-4 py-3 text-left font-medium'>연락처</th>
              <th className='whitespace-nowrap px-4 py-3 text-center font-medium'>지원</th>
              <th className='whitespace-nowrap px-4 py-3 text-center font-medium'>합격</th>
              <th className='w-20 px-4 py-3'></th>
            </tr>
          </thead>
          <tbody>
            {applicants.map((a) => (
              <tr
                key={a.id}
                className={`group border-b transition-colors last:border-0 hover:bg-muted/30 ${
                  selected.has(a.id) ? 'bg-muted/40' : ''
                }`}
              >
                {isDeveloper && (
                  <td className='px-4 py-3'>
                    <Checkbox
                      checked={selected.has(a.id)}
                      onCheckedChange={() => toggleOne(a.id)}
                      aria-label={`${a.name} 선택`}
                    />
                  </td>
                )}
                <td className='px-4 py-3 font-medium'>
                  <Link href={`/dashboard/applicants/${a.id}`} className='hover:underline'>
                    {a.name}
                  </Link>
                </td>
                <td className='text-muted-foreground px-4 py-3'>
                  {a.department ?? '-'}
                </td>
                <td className='text-muted-foreground px-4 py-3'>
                  {a.organizationName ?? '-'}
                </td>
                <td className='text-muted-foreground px-4 py-3'>
                  {a.job_title ?? '-'}
                </td>
                <td className='text-muted-foreground px-4 py-3'>
                  {a.phone ?? a.email ?? '-'}
                </td>
                <td className='px-4 py-3 text-center'>
                  {a.applicationCount > 0 ? (
                    <span className='font-medium'>{a.applicationCount}</span>
                  ) : (
                    <span className='text-muted-foreground'>-</span>
                  )}
                </td>
                <td className='px-4 py-3 text-center'>
                  {a.selectedCount > 0 ? (
                    <Badge variant='outline' className={STATUS_BADGE_CLASS}>
                      {a.selectedCount}
                    </Badge>
                  ) : (
                    <span className='text-muted-foreground'>-</span>
                  )}
                </td>
                <td className='px-4 py-3'>
                  <div className='flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                    <ApplicantSheet
                      applicant={a}
                      trigger={
                        <Button variant='ghost' size='icon' className='h-7 w-7'>
                          <Icons.edit className='h-3.5 w-3.5' />
                        </Button>
                      }
                    />
                    {isDeveloper && (
                      <Button
                        variant='ghost'
                        size='icon'
                        className='text-destructive hover:text-destructive h-7 w-7'
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(a);
                        }}
                      >
                        <Icons.trash className='h-3.5 w-3.5' />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 지원자 <strong>{selected.size}명</strong>을 삭제하시겠습니까?
              {' '}이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkDeleteError && (
            <div className='text-destructive text-sm px-1'>{bulkDeleteError}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={onBulkDelete}
              disabled={pending}
              className='bg-destructive hover:bg-destructive/90 text-white'
            >
              {pending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지원자 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong>을(를) 삭제하시겠습니까?
              {' '}이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className='text-destructive text-sm px-1'>{deleteError}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={pending}
              className='bg-destructive hover:bg-destructive/90 text-white'
            >
              {pending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
