'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { LessonRowActions } from './lesson-row-actions';

export type LessonRow = {
  id: string;
  session_date: string;
  title: string | null;
  locationName: string | null;
  instructorNames: string;
  assistantNames: string;
  isComplete: boolean;
  pct: number;
  prog: { filled: number; total: number } | undefined;
  assignmentCount: number;
};

type Props = {
  cohortId: string;
  rows: LessonRow[];
  ascending: boolean;
};

export function LessonsTable({ cohortId, rows, ascending }: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => {
        const hay = `${r.session_date} ${(r.title ?? '').toLowerCase()} ${r.instructorNames.toLowerCase()} ${r.assistantNames.toLowerCase()} ${(r.locationName ?? '').toLowerCase()}`;
        return hay.includes(q);
      })
    : rows;

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <Input
          placeholder='날짜·제목·강사·장소 검색'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className='h-9 w-full sm:w-72'
        />
        {searchQuery && (
          <Button variant='ghost' size='sm' className='h-9' onClick={() => setSearchQuery('')}>
            초기화
          </Button>
        )}
        <span className='text-muted-foreground ml-auto text-sm'>{filtered.length}개</span>
      </div>
      <div className='rounded-xl border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12 text-center'>완료</TableHead>
              <TableHead className='w-12 text-center'>과제</TableHead>
              <TableHead className='w-32'>
                <Link
                  href={`?order=${ascending ? 'desc' : 'asc'}`}
                  scroll={false}
                  className='hover:text-foreground inline-flex items-center gap-1 select-none'
                  title='클릭하여 정렬'
                >
                  날짜
                  <span className='text-muted-foreground text-[10px] tabular-nums'>
                    {ascending ? '↑' : '↓'}
                  </span>
                </Link>
              </TableHead>
              <TableHead>제목</TableHead>
              <TableHead className='w-40'>장소</TableHead>
              <TableHead>강사</TableHead>
              <TableHead>보조강사</TableHead>
              <TableHead className='w-28 text-right'>관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const detailHref = `/dashboard/cohorts/${cohortId}/lessons/${r.id}`;
              return (
                <TableRow key={r.id} className='hover:bg-muted/40'>
                  <TableCell className='text-center'>
                    <ProgressIndicator complete={r.isComplete} pct={r.pct} prog={r.prog} />
                  </TableCell>
                  <TableCell className='text-center'>
                    <AssignmentIndicator count={r.assignmentCount} />
                  </TableCell>
                  <TableCell className='font-mono text-sm'>
                    <Link href={detailHref} className='hover:underline'>
                      {r.session_date}
                    </Link>
                  </TableCell>
                  <TableCell className='font-medium'>
                    <Link href={detailHref} className='hover:underline'>
                      {r.title ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell className='text-muted-foreground text-sm'>
                    {r.locationName ?? '—'}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-sm'>{r.instructorNames}</TableCell>
                  <TableCell className='text-muted-foreground text-sm'>{r.assistantNames}</TableCell>
                  <TableCell className='text-right'>
                    <LessonRowActions cohortId={cohortId} sessionId={r.id} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AssignmentIndicator({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span
        title='연결된 과제 없음'
        className='border-muted-foreground/30 text-muted-foreground/40 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]'
      >
        −
      </span>
    );
  }
  return (
    <span
      title={`연결된 과제 ${count}개`}
      className='inline-flex items-center justify-center gap-0.5'
    >
      <Icons.circleCheck className='h-5 w-5 text-amber-600 dark:text-amber-400' />
      {count > 1 && (
        <span className='text-[10px] font-bold text-amber-700 dark:text-amber-400'>{count}</span>
      )}
    </span>
  );
}

function ProgressIndicator({
  complete,
  pct,
  prog
}: {
  complete: boolean;
  pct: number;
  prog: { filled: number; total: number } | undefined;
}) {
  const title = prog
    ? `출결 입력 ${prog.filled}/${prog.total} (${pct}%)`
    : '출결 데이터 없음';

  if (complete) {
    return (
      <span title={title} className='inline-flex items-center justify-center'>
        <Icons.circleCheck className='h-5 w-5 text-emerald-600 dark:text-emerald-400' />
      </span>
    );
  }
  return (
    <span
      title={title}
      className='border-muted-foreground/40 text-muted-foreground inline-flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold'
    >
      {pct > 0 ? `${pct}` : ''}
    </span>
  );
}
