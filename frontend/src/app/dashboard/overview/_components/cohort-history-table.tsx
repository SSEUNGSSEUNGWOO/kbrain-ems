'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Icons } from '@/components/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { AFFILIATION_COLORS, UNCLASSIFIED_LABEL } from '@/lib/affiliation';
import type { AffiliationStatRow, CohortHistoryRow } from '@/lib/business-stats';

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '일정 미정';
  const s = start ? start.slice(2).replace(/-/g, '.') : '미정';
  const e = end ? end.slice(2).replace(/-/g, '.') : '미정';
  return s === e ? s : `${s} ~ ${e}`;
}

function num(v: number | null): string {
  return v === null ? '—' : String(v);
}

function competitionRate(applied: number, capacity: number | null): string {
  if (!capacity || applied === 0) return '—';
  return `${(Math.round((applied / capacity) * 10) / 10).toFixed(1)}:1`;
}

function affColor(label: string): string {
  return AFFILIATION_COLORS[label] ?? AFFILIATION_COLORS[UNCLASSIFIED_LABEL];
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  const v = (part / total) * 100;
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}%`;
}

function StackedBar({
  rows,
  field,
  total
}: {
  rows: AffiliationStatRow[];
  field: 'applied' | 'selected';
  total: number;
}) {
  if (total === 0) {
    return <div className='bg-muted h-2.5 w-full rounded-full' />;
  }
  return (
    <div className='flex h-2.5 w-full overflow-hidden rounded-full'>
      {rows
        .filter((r) => r[field] > 0)
        .map((r) => (
          <div
            key={r.label}
            title={`${r.label} ${r[field]}건`}
            style={{ width: `${(r[field] / total) * 100}%`, backgroundColor: affColor(r.label) }}
          />
        ))}
    </div>
  );
}

function AffiliationDetail({ row }: { row: CohortHistoryRow }) {
  const rows = row.affiliations;
  if (rows.length === 0) {
    return <p className='text-muted-foreground py-2 text-sm'>지원 데이터가 없습니다.</p>;
  }
  return (
    <div className='grid gap-6 py-1 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]'>
      <div className='space-y-4'>
        <div>
          <div className='mb-1.5 flex items-baseline justify-between'>
            <span className='text-muted-foreground text-xs font-medium'>지원 구성</span>
            <span className='text-xs tabular-nums'>{row.applied}건</span>
          </div>
          <StackedBar rows={rows} field='applied' total={row.applied} />
        </div>
        <div>
          <div className='mb-1.5 flex items-baseline justify-between'>
            <span className='text-muted-foreground text-xs font-medium'>선발 구성</span>
            <span className='text-xs tabular-nums'>{row.selected}건</span>
          </div>
          <StackedBar rows={rows} field='selected' total={row.selected} />
        </div>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-muted-foreground border-b text-xs'>
              <th className='py-1.5 pr-4 text-left font-medium'>구분</th>
              <th className='px-2 py-1.5 text-right font-medium'>지원</th>
              <th className='px-2 py-1.5 text-right font-medium'>비중</th>
              <th className='px-2 py-1.5 text-right font-medium'>선발</th>
              <th className='px-2 py-1.5 text-right font-medium'>비중</th>
              <th className='py-1.5 pl-2 text-right font-medium'>선발률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.label} className='border-b border-dashed last:border-0'>
                <td className='py-1.5 pr-4'>
                  <span className='flex items-center gap-2 whitespace-nowrap'>
                    <span
                      className='h-2 w-2 shrink-0 rounded-full'
                      style={{ backgroundColor: affColor(a.label) }}
                    />
                    {a.label}
                  </span>
                </td>
                <td className='px-2 py-1.5 text-right tabular-nums'>{a.applied}</td>
                <td className='text-muted-foreground px-2 py-1.5 text-right tabular-nums'>
                  {pct(a.applied, row.applied)}
                </td>
                <td className='px-2 py-1.5 text-right tabular-nums'>{a.selected}</td>
                <td className='text-muted-foreground px-2 py-1.5 text-right tabular-nums'>
                  {pct(a.selected, row.selected)}
                </td>
                <td className='text-muted-foreground py-1.5 pl-2 text-right tabular-nums'>
                  {a.applied > 0 ? pct(a.selected, a.applied) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CohortHistoryTable({
  label,
  tone,
  rows
}: {
  label: string;
  tone: string;
  rows: CohortHistoryRow[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (rows.length === 0) return null;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section>
      <div className='mb-2 flex items-center gap-2'>
        <span
          className={`bg-card inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${tone}`}
        >
          {label}
        </span>
        <span className='text-muted-foreground text-xs'>{rows.length}개 기수</span>
      </div>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/50 hover:bg-muted/50'>
              <TableHead className='w-8' />
              <TableHead className='text-muted-foreground text-xs'>과정명</TableHead>
              <TableHead className='text-muted-foreground text-xs whitespace-nowrap'>
                교육일
              </TableHead>
              <TableHead className='text-muted-foreground text-right text-xs'>정원</TableHead>
              <TableHead className='text-muted-foreground text-right text-xs'>신청</TableHead>
              <TableHead className='text-muted-foreground text-right text-xs whitespace-nowrap'>
                경쟁률
              </TableHead>
              <TableHead className='text-muted-foreground text-right text-xs'>선발</TableHead>
              <TableHead className='text-muted-foreground text-right text-xs'>응시</TableHead>
              <TableHead className='text-muted-foreground text-right text-xs'>수료</TableHead>
              <TableHead className='text-muted-foreground text-right text-xs'>합격</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const expanded = open.has(r.cohortId);
              return (
                <Fragment key={r.cohortId}>
                  <TableRow
                    onClick={() => toggle(r.cohortId)}
                    className='cursor-pointer'
                    data-state={expanded ? 'selected' : undefined}
                  >
                    <TableCell className='pr-0'>
                      <Icons.chevronRight
                        className={`text-muted-foreground h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                      />
                    </TableCell>
                    <TableCell className='font-medium'>
                      <Link
                        href={`/dashboard/cohorts/${r.cohortId}`}
                        className='hover:underline'
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm whitespace-nowrap tabular-nums'>
                      {formatPeriod(r.startedAt, r.endedAt)}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-right tabular-nums'>
                      {num(r.capacity)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{r.applied}</TableCell>
                    <TableCell className='text-muted-foreground text-right tabular-nums'>
                      {competitionRate(r.applied, r.capacity)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{r.selected}</TableCell>
                    <TableCell className='text-right tabular-nums'>{num(r.examTaken)}</TableCell>
                    <TableCell className='text-right tabular-nums'>{num(r.completed)}</TableCell>
                    <TableCell className='text-muted-foreground text-right tabular-nums'>
                      {num(r.certPassed)}
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className='hover:bg-transparent'>
                      <TableCell colSpan={10} className='bg-muted/30 px-6 py-4'>
                        <AffiliationDetail row={r} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
