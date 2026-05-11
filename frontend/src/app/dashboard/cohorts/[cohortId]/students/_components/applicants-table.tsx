'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { promoteApplicant, unpromoteApplicant } from '../_actions';

type Row = {
  applicationId: string;
  applicantId: string;
  name: string;
  organizationName: string | null;
  email: string | null;
  phone: string | null;
  appliedAt: string | null;
  status: string;
  motivation: string | null;
};

type Props = {
  cohortId: string;
  rows: Row[];
};

const STATUS_LABEL: Record<string, string> = {
  applied: '신청',
  shortlisted: '검토',
  selected: '합격',
  rejected: '탈락',
  withdrew: '철회'
};

export function ApplicantsTable({ cohortId, rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onPromote = (applicantId: string, name: string) => {
    if (!confirm(`${name}님을 합격 처리하시겠습니까? 교육생으로 등록됩니다.`)) return;
    startTransition(async () => {
      const result = await promoteApplicant(cohortId, applicantId);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  const onUnpromote = (applicantId: string, name: string) => {
    if (!confirm(`${name}님 합격을 취소하시겠습니까? 교육생 데이터에서 제거됩니다.`)) return;
    startTransition(async () => {
      const result = await unpromoteApplicant(cohortId, applicantId);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className='rounded-xl border bg-card px-6 py-12 text-center text-muted-foreground'>
        아직 신청자가 없습니다. 공유 링크를 카톡방·메일에 배포하면 여기에 표시됩니다.
      </div>
    );
  }

  const appliedCount = rows.filter((r) => r.status === 'applied').length;
  const selectedCount = rows.filter((r) => r.status === 'selected').length;

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-4 rounded-md border bg-muted/30 px-4 py-2 text-sm'>
        <span>
          신청 <strong className='text-foreground'>{appliedCount}명</strong> · 합격{' '}
          <strong className='text-emerald-700 dark:text-emerald-400'>{selectedCount}명</strong>
        </span>
      </div>

      <div className='rounded-xl border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>소속 기관</TableHead>
              <TableHead>연락처</TableHead>
              <TableHead className='w-28'>신청일</TableHead>
              <TableHead className='w-20'>상태</TableHead>
              <TableHead className='w-28 text-right'>관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.applicationId}>
                <TableCell className='font-medium'>{r.name}</TableCell>
                <TableCell className='text-sm'>{r.organizationName ?? '—'}</TableCell>
                <TableCell className='text-xs text-muted-foreground'>
                  {r.email && <div>{r.email}</div>}
                  {r.phone && <div>{r.phone}</div>}
                  {!r.email && !r.phone && '—'}
                </TableCell>
                <TableCell className='font-mono text-xs'>{r.appliedAt ?? '—'}</TableCell>
                <TableCell>
                  <Badge
                    variant='outline'
                    className={
                      r.status === 'selected'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : r.status === 'applied'
                          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
                          : ''
                    }
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell className='text-right'>
                  {r.status === 'selected' ? (
                    <Button
                      variant='ghost'
                      size='sm'
                      disabled={pending}
                      onClick={() => onUnpromote(r.applicantId, r.name)}
                    >
                      취소
                    </Button>
                  ) : (
                    <Button
                      size='sm'
                      disabled={pending}
                      onClick={() => onPromote(r.applicantId, r.name)}
                    >
                      합격
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
