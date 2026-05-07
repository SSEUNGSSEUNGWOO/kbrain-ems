'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { deleteApplication } from '../_actions';
import {
  ApplicationSheet,
  STAGE_LABELS,
  STATUS_LABELS,
  type Application,
  type Cohort
} from './application-sheet';

type ApplicationRow = Application & { cohortName: string | null };

const STATUS_BADGE_CLASS: Record<string, string> = {
  applied:
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300',
  shortlisted:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  selected:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  rejected:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  withdrew:
    'border-border bg-muted text-muted-foreground'
};

export function ApplicationTable({
  applicantId,
  cohorts,
  applications
}: {
  applicantId: string;
  cohorts: Cohort[];
  applications: ApplicationRow[];
}) {
  const [deleteTarget, setDeleteTarget] = useState<ApplicationRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteApplication(deleteTarget.id, applicantId);
      if (result?.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    });
  };

  if (applications.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-12'>
        <p className='text-muted-foreground text-sm'>
          등록된 지원 이력이 없습니다. 우측 상단에서 추가해주세요.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className='rounded-md border'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='bg-muted/50 border-b'>
              <th className='px-4 py-3 text-left font-medium'>기수</th>
              <th className='whitespace-nowrap px-4 py-3 text-left font-medium'>결과</th>
              <th className='whitespace-nowrap px-4 py-3 text-left font-medium'>탈락 단계</th>
              <th className='whitespace-nowrap px-4 py-3 text-left font-medium'>지원일</th>
              <th className='whitespace-nowrap px-4 py-3 text-left font-medium'>결정일</th>
              <th className='px-4 py-3 text-left font-medium'>메모</th>
              <th className='w-20 px-4 py-3'></th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr
                key={a.id}
                className='group border-b transition-colors last:border-0 hover:bg-muted/30'
              >
                <td className='px-4 py-3 font-medium'>{a.cohortName ?? '-'}</td>
                <td className='px-4 py-3'>
                  <Badge variant='outline' className={STATUS_BADGE_CLASS[a.status] ?? ''}>
                    {STATUS_LABELS[a.status] ?? a.status}
                  </Badge>
                </td>
                <td className='text-muted-foreground px-4 py-3'>
                  {a.status === 'rejected' && a.rejected_stage
                    ? (STAGE_LABELS[a.rejected_stage] ?? a.rejected_stage)
                    : '-'}
                </td>
                <td className='text-muted-foreground whitespace-nowrap px-4 py-3'>
                  {a.applied_at ?? '-'}
                </td>
                <td className='text-muted-foreground whitespace-nowrap px-4 py-3'>
                  {a.decided_at ?? '-'}
                </td>
                <td className='text-muted-foreground px-4 py-3'>{a.note ?? '-'}</td>
                <td className='px-4 py-3'>
                  <div className='flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                    <ApplicationSheet
                      applicantId={applicantId}
                      cohorts={cohorts}
                      application={a}
                      trigger={
                        <Button variant='ghost' size='icon' className='h-7 w-7'>
                          <Icons.edit className='h-3.5 w-3.5' />
                        </Button>
                      }
                    />
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지원 이력 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.cohortName ?? '이 기수'}</strong>의 지원 이력을 삭제하시겠습니까?
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
