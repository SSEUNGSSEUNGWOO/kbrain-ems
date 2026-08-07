'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';

export type CertResultRow = {
  studentId: string;
  name: string;
  organization: string | null;
  departmentTitle: string;
  totalScore: number | null;
  sectionScores: Record<string, number | string | null>;
  passed: boolean | null;
  certNo: string | null;
  /** 타 기수(자기주도형)에서 응시해 반영된 경우 그 기수명 */
  sourceCohortName: string | null;
};

type Filter = 'all' | 'passed' | 'failed' | 'absent';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'passed', label: '합격' },
  { key: 'failed', label: '불합격' },
  { key: 'absent', label: '미응시' }
];

export function CertResultsTable({
  rows,
  sectionCols
}: {
  rows: CertResultRow[];
  sectionCols: string[];
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortByScore, setSortByScore] = useState(false);

  const counts = useMemo(
    () => ({
      all: rows.length,
      passed: rows.filter((r) => r.passed === true).length,
      failed: rows.filter((r) => r.passed === false).length,
      absent: rows.filter((r) => r.totalScore === null && r.passed === null).length
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.organization ?? '').toLowerCase().includes(q) ||
          (r.certNo ?? '').toLowerCase().includes(q)
      );
    }
    if (filter === 'passed') out = out.filter((r) => r.passed === true);
    else if (filter === 'failed') out = out.filter((r) => r.passed === false);
    else if (filter === 'absent')
      out = out.filter((r) => r.totalScore === null && r.passed === null);
    return sortByScore ? out.toSorted((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1)) : out;
  }, [rows, search, filter, sortByScore]);

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative w-full sm:w-72'>
          <Icons.search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='이름 · 소속 · 인증번호 검색'
            className='pl-8'
          />
        </div>
        <div className='flex flex-wrap gap-1'>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type='button'
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs transition-colors',
                filter === f.key
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted text-muted-foreground'
              )}
            >
              {f.label} {counts[f.key]}
            </button>
          ))}
        </div>
        <button
          type='button'
          onClick={() => setSortByScore((v) => !v)}
          className={cn(
            'ml-auto rounded-md border px-2.5 py-1 text-xs transition-colors',
            sortByScore ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
          )}
        >
          총점 높은 순 {sortByScore ? '↓' : ''}
        </button>
      </div>

      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>NO</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>소속기관</TableHead>
              <TableHead>부서·직책</TableHead>
              <TableHead className='text-right'>총점</TableHead>
              {sectionCols.map((sec) => (
                <TableHead key={sec} className='text-right whitespace-nowrap'>
                  {sec}
                </TableHead>
              ))}
              <TableHead className='text-center'>결과</TableHead>
              <TableHead className='whitespace-nowrap'>인증번호</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6 + sectionCols.length}
                  className='text-muted-foreground py-8 text-center'
                >
                  조건에 맞는 교육생이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r, idx) => (
                <TableRow key={r.studentId}>
                  <TableCell className='text-muted-foreground tabular-nums'>{idx + 1}</TableCell>
                  <TableCell className='font-medium'>{r.name}</TableCell>
                  <TableCell className='text-muted-foreground'>{r.organization ?? '—'}</TableCell>
                  <TableCell className='text-muted-foreground text-sm'>
                    {r.departmentTitle || '—'}
                  </TableCell>
                  <TableCell className='text-right font-medium tabular-nums'>
                    {r.totalScore ?? '—'}
                  </TableCell>
                  {sectionCols.map((sec) => (
                    <TableCell key={sec} className='text-right text-sm tabular-nums'>
                      {r.sectionScores?.[sec] ?? '—'}
                    </TableCell>
                  ))}
                  <TableCell className='text-center'>
                    <div className='flex flex-col items-center gap-0.5'>
                      {r.totalScore === null && r.passed === null ? (
                        <span className='text-muted-foreground text-xs'>미응시</span>
                      ) : r.passed === true ? (
                        <Badge
                          variant='outline'
                          className='border-emerald-200 bg-emerald-50 font-normal text-emerald-700'
                        >
                          합격
                        </Badge>
                      ) : r.passed === false ? (
                        <Badge
                          variant='outline'
                          className='border-rose-200 bg-rose-50 font-normal text-rose-700'
                        >
                          불합격
                        </Badge>
                      ) : (
                        <span className='text-muted-foreground text-xs'>미채점</span>
                      )}
                      {r.sourceCohortName && (
                        <span className='text-[10px] whitespace-nowrap text-blue-600'>
                          {r.sourceCohortName} 응시
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs tabular-nums'>
                    {r.certNo ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {(search.trim() || filter !== 'all') && (
        <p className='text-muted-foreground text-xs'>
          {visible.length}명 표시 (전체 {rows.length}명)
        </p>
      )}
    </div>
  );
}
