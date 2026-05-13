'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { cn } from '@/lib/utils';

export type ApplicationRow = {
  id: string;
  applicant_id: string;
  name: string;
  organization: string | null;
  department: string | null;
  job_role: string | null;
  status: string;
  rejected_stage: string | null;
  knowledge_score: number | null;
  knowledge_correct_count: number | null;
  knowledge_total_count: number | null;
  self_diagnosis_avg: number | null;
  decided_at: string | null;
  applied_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  applied: '신청',
  pending: '심사중',
  selected: '선발',
  rejected: '탈락',
  withdrawn: '취하'
};

const STATUS_TONE: Record<string, string> = {
  applied: 'bg-slate-100 text-slate-700 border-slate-300',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  selected: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  withdrawn: 'bg-slate-50 text-slate-500 border-slate-200'
};

type Props = {
  rows: ApplicationRow[];
  cohortId: string;
  page: number;
  pageSize: number;
  pageCount: number;
  totalCount: number;
};

export function ApplicantsTable({ rows, cohortId, page, pageSize, pageCount, totalCount }: Props) {
  const [{ q }, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1)
    },
    { shallow: false }
  );

  const [inputValue, setInputValue] = useState(q);
  useEffect(() => {
    setInputValue(q);
  }, [q]);

  const debouncedSetQ = useDebouncedCallback((value: string) => {
    void setParams({ q: value || null, page: null });
  }, 300);

  const onSearchChange = (value: string) => {
    setInputValue(value);
    debouncedSetQ(value);
  };

  const onClearSearch = () => {
    setInputValue('');
    void setParams({ q: null, page: null });
  };

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), Math.max(1, pageCount));
    void setParams({ page: clamped === 1 ? null : clamped });
  };

  const isEmpty = rows.length === 0;
  const firstIndex = isEmpty ? 0 : (page - 1) * pageSize + 1;
  const lastIndex = isEmpty ? 0 : (page - 1) * pageSize + rows.length;
  const hasSearch = Boolean(q);

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative w-full sm:w-72'>
          <Icons.search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            value={inputValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder='이름 또는 연락처 검색'
            className='pl-8 pr-8'
          />
          {inputValue && (
            <button
              type='button'
              onClick={onClearSearch}
              className='text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2'
              aria-label='검색어 지우기'
            >
              <Icons.close className='size-4' />
            </button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
          <div className='bg-muted text-muted-foreground mb-4 flex h-14 w-14 items-center justify-center rounded-full'>
            <Icons.search className='h-6 w-6' />
          </div>
          <p className='text-foreground mb-1 font-medium'>
            {hasSearch ? '검색 결과가 없습니다' : '신청자가 없습니다'}
          </p>
          {hasSearch && (
            <p className='text-muted-foreground text-sm'>다른 검색어를 시도해보세요.</p>
          )}
        </div>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>소속</TableHead>
                <TableHead>부서·직렬</TableHead>
                <TableHead className='text-right'>지식평가</TableHead>
                <TableHead className='text-right'>자가진단</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>신청일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className='hover:bg-muted/50'>
                  <TableCell>
                    <Link
                      href={`/dashboard/cohorts/${cohortId}/applications/${r.id}`}
                      className='font-medium hover:underline'
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>{r.organization ?? '—'}</TableCell>
                  <TableCell className='text-muted-foreground text-sm'>
                    {[r.department, r.job_role].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    <KnowledgeCell row={r} />
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {r.self_diagnosis_avg !== null ? `${r.self_diagnosis_avg.toFixed(1)} / 5` : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} rejectedStage={r.rejected_stage} />
                  </TableCell>
                  <TableCell className='text-muted-foreground text-sm'>
                    {r.applied_at ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isEmpty && (
        <div className='grid grid-cols-3 items-center gap-2'>
          <div className='text-muted-foreground text-xs tabular-nums'>
            {firstIndex.toLocaleString()}–{lastIndex.toLocaleString()} /{' '}
            {totalCount.toLocaleString()}건
          </div>
          <div className='flex items-center justify-center gap-1'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              <Icons.chevronLeft className='size-4' />
              이전
            </Button>
            <span className='text-muted-foreground px-2 text-xs tabular-nums'>
              {page} / {pageCount}
            </span>
            <Button
              variant='outline'
              size='sm'
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount}
            >
              다음
              <Icons.chevronRight className='size-4' />
            </Button>
          </div>
          <div />
        </div>
      )}
    </div>
  );
}

function KnowledgeCell({ row }: { row: ApplicationRow }) {
  if (row.knowledge_score === null) return <span className='text-muted-foreground'>—</span>;
  const correct = row.knowledge_correct_count;
  const total = row.knowledge_total_count;
  return (
    <span>
      <span className='font-medium'>{row.knowledge_score}점</span>
      {correct !== null && total !== null && (
        <span className='text-muted-foreground ml-1 text-xs'>
          ({correct}/{total})
        </span>
      )}
    </span>
  );
}

function StatusBadge({ status, rejectedStage }: { status: string; rejectedStage: string | null }) {
  const label = STATUS_LABEL[status] ?? status;
  const tone = STATUS_TONE[status] ?? STATUS_TONE.applied;
  return (
    <Badge variant='outline' className={cn('font-normal', tone)}>
      {label}
      {status === 'rejected' && rejectedStage && (
        <span className='ml-1 opacity-70'>· {rejectedStage}</span>
      )}
    </Badge>
  );
}
