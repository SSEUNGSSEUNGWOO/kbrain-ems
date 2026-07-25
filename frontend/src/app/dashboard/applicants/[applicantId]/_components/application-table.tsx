'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { cn } from '@/lib/utils';
import { deleteApplication, updateApplicationStatus } from '../_actions';
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
  selected:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  rejected:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  pre_cancel:
    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
  same_day_cancel:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
};

const STATUS_ORDER = ['applied', 'selected', 'rejected', 'pre_cancel', 'same_day_cancel'] as const;
const STAGE_ORDER = ['docs', 'interview', 'final'] as const;

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
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
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

  const applyStatusChange = (
    row: ApplicationRow,
    nextStatus: string,
    nextStage: string | null
  ) => {
    setRowError(null);
    setPendingRowId(row.id);
    startTransition(async () => {
      const result = await updateApplicationStatus(
        row.id,
        applicantId,
        nextStatus,
        nextStage
      );
      setPendingRowId(null);
      if (result?.error) {
        setRowError({ id: row.id, message: result.error });
        return;
      }
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
            {applications.map((a) => {
              const isRowPending = pendingRowId === a.id;
              const tone = STATUS_BADGE_CLASS[a.status] ?? '';
              return (
                <tr
                  key={a.id}
                  className={cn(
                    'group border-b transition-colors last:border-0 hover:bg-muted/30',
                    isRowPending && 'opacity-60'
                  )}
                >
                  <td className='px-4 py-3 font-medium'>{a.cohortName ?? '-'}</td>
                  <td className='px-4 py-3'>
                    <div className='inline-flex items-center gap-1'>
                      <div className='relative'>
                        <select
                          value={a.status}
                          disabled={pending}
                          onChange={(e) => {
                            const next = e.target.value;
                            const stage = next === 'rejected' ? a.rejected_stage : null;
                            applyStatusChange(a, next, stage);
                          }}
                          className={cn(
                            'appearance-none rounded-md border px-2 py-0.5 pr-6 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed',
                            tone
                          )}
                          aria-label='결과 변경'
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s] ?? s}
                            </option>
                          ))}
                        </select>
                        <Icons.chevronDown className='pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60' />
                      </div>
                      {isRowPending && (
                        <Icons.spinner className='text-muted-foreground h-3.5 w-3.5 animate-spin' />
                      )}
                    </div>
                  </td>
                  <td className='text-muted-foreground px-4 py-3'>
                    {a.status === 'rejected' ? (
                      <div className='relative inline-block'>
                        <select
                          value={a.rejected_stage ?? ''}
                          disabled={pending}
                          onChange={(e) => {
                            const stage = e.target.value || null;
                            applyStatusChange(a, a.status, stage);
                          }}
                          className='appearance-none rounded-md border bg-background px-2 py-0.5 pr-6 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed'
                          aria-label='탈락 단계 변경'
                        >
                          <option value=''>단계 선택</option>
                          {STAGE_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {STAGE_LABELS[s] ?? s}
                            </option>
                          ))}
                        </select>
                        <Icons.chevronDown className='pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60' />
                      </div>
                    ) : (
                      '-'
                    )}
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
              );
            })}
          </tbody>
        </table>
      </div>

      {rowError && (
        <div className='text-destructive mt-2 text-sm'>{rowError.message}</div>
      )}

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
