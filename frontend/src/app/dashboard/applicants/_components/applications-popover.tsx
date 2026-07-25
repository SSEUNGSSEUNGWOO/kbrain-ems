'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { updateApplicationStatus } from '../[applicantId]/_actions';

export type ApplicationSummary = {
  id: string;
  cohort_id: string;
  cohort_name: string;
  status: string;
  rejected_stage: string | null;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'applied', label: '신청' },
  { value: 'selected', label: '선발' },
  { value: 'rejected', label: '탈락' },
  { value: 'pre_cancel', label: '사전취소' },
  { value: 'same_day_cancel', label: '당일취소' }
];

const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'docs', label: '서류' },
  { value: 'interview', label: '면접' },
  { value: 'final', label: '최종' }
];

const STATUS_TONE: Record<string, string> = {
  applied: 'text-slate-700 dark:text-slate-300',
  selected: 'text-emerald-700 dark:text-emerald-300',
  rejected: 'text-rose-700 dark:text-rose-300',
  pre_cancel: 'text-orange-700 dark:text-orange-300',
  same_day_cancel: 'text-rose-700 dark:text-rose-300'
};

export function ApplicationsPopover({
  applicantId,
  applicantName,
  applications,
  trigger
}: {
  applicantId: string;
  applicantName: string;
  applications: ApplicationSummary[];
  trigger: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [pendingAppId, setPendingAppId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const applyChange = (
    appId: string,
    nextStatus: string,
    nextStage: string | null
  ) => {
    setError(null);
    setPendingAppId(appId);
    startTransition(async () => {
      const result = await updateApplicationStatus(
        appId,
        applicantId,
        nextStatus,
        nextStage
      );
      setPendingAppId(null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align='center' className='w-96 p-0'>
        <div className='border-b px-4 py-2.5'>
          <div className='flex items-baseline gap-2'>
            <span className='text-sm font-semibold'>{applicantName}</span>
            <span className='text-muted-foreground text-xs'>
              지원 이력 {applications.length}개
            </span>
          </div>
          <Link
            href={`/dashboard/applicants/${applicantId}`}
            className='text-primary mt-1 inline-flex items-center gap-0.5 text-xs hover:underline'
          >
            상세로 이동
            <Icons.chevronRight className='h-3 w-3' />
          </Link>
        </div>
        <ul className='max-h-80 overflow-y-auto'>
          {applications.map((app) => {
            const rowPending = pendingAppId === app.id;
            return (
              <li
                key={app.id}
                className='flex items-center justify-between gap-2 border-b px-3 py-2 last:border-0'
              >
                <span className='min-w-0 flex-1 truncate text-xs font-medium'>
                  {app.cohort_name}
                </span>
                <div className='flex items-center gap-1.5'>
                  <div className='relative'>
                    <select
                      value={app.status}
                      disabled={pending}
                      onChange={(e) => {
                        const next = e.target.value;
                        const stage = next === 'rejected' ? app.rejected_stage : null;
                        applyChange(app.id, next, stage);
                      }}
                      className={cn(
                        'appearance-none rounded-md border bg-background px-2 py-0.5 pr-6 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed',
                        STATUS_TONE[app.status]
                      )}
                      aria-label={`${app.cohort_name} 결과 변경`}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <Icons.chevronDown className='pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60' />
                  </div>
                  {app.status === 'rejected' && (
                    <div className='relative'>
                      <select
                        value={app.rejected_stage ?? ''}
                        disabled={pending}
                        onChange={(e) => {
                          const stage = e.target.value || null;
                          applyChange(app.id, app.status, stage);
                        }}
                        className='appearance-none rounded-md border bg-background px-2 py-0.5 pr-6 text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed'
                        aria-label={`${app.cohort_name} 탈락 단계`}
                      >
                        <option value=''>단계</option>
                        {STAGE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <Icons.chevronDown className='pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60' />
                    </div>
                  )}
                  {rowPending && (
                    <Icons.spinner className='text-muted-foreground h-3 w-3 animate-spin' />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {error && <div className='text-destructive border-t px-3 py-2 text-xs'>{error}</div>}
      </PopoverContent>
    </Popover>
  );
}
