'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { OrganizationStatRow } from '@/lib/business-stats';

const DEFAULT_VISIBLE = 20;

type SortKey = 'name' | 'applied' | 'selected' | 'lastSelectedAt';

export function OrganizationStatsTable({ rows }: { rows: OrganizationStatRow[] }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('applied');
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    const sorted = base.toSorted((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name, 'ko');
      else if (sortKey === 'applied') cmp = a.applied - b.applied;
      else if (sortKey === 'selected') cmp = a.selected - b.selected;
      else cmp = (a.lastSelectedAt ?? '').localeCompare(b.lastSelectedAt ?? '');
      return sortDesc ? -cmp : cmp;
    });
    return sorted;
  }, [rows, search, sortKey, sortDesc]);

  // 검색 중엔 전체, 아니면 접힘 상태에 따라 상위 N개
  const visible = search.trim() || expanded ? filtered : filtered.slice(0, DEFAULT_VISIBLE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key !== 'name');
    }
  };
  const arrow = (key: SortKey) => (sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : '');

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <Input
          placeholder='기관명 검색'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='h-9 max-w-xs'
        />
        <span className='text-muted-foreground text-xs whitespace-nowrap'>
          {search.trim() ? `검색 결과 ${filtered.length}개` : `총 ${rows.length}개 기관`}
        </span>
      </div>

      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-10 text-center'>NO</TableHead>
              <TableHead>
                <button type='button' onClick={() => toggleSort('name')} className='font-medium'>
                  기관명{arrow('name')}
                </button>
              </TableHead>
              <TableHead className='text-right'>
                <button type='button' onClick={() => toggleSort('applied')} className='font-medium'>
                  지원{arrow('applied')}
                </button>
              </TableHead>
              <TableHead className='text-right'>
                <button
                  type='button'
                  onClick={() => toggleSort('selected')}
                  className='font-medium'
                >
                  선발{arrow('selected')}
                </button>
              </TableHead>
              <TableHead className='text-right'>선발률</TableHead>
              <TableHead className='text-right'>
                <button
                  type='button'
                  onClick={() => toggleSort('lastSelectedAt')}
                  className='font-medium'
                >
                  최근 선발일{arrow('lastSelectedAt')}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className='text-muted-foreground py-8 text-center'>
                  검색 결과가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r, i) => (
                <TableRow key={r.orgId ?? '__none__'}>
                  <TableCell className='text-muted-foreground text-center tabular-nums'>
                    {i + 1}
                  </TableCell>
                  <TableCell className={r.orgId ? 'font-medium' : 'text-muted-foreground'}>
                    {r.name}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{r.applied}</TableCell>
                  <TableCell className='text-right tabular-nums'>{r.selected}</TableCell>
                  <TableCell className='text-muted-foreground text-right tabular-nums'>
                    {r.applied > 0 ? `${Math.round((r.selected / r.applied) * 100)}%` : '—'}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-right text-sm tabular-nums'>
                    {r.lastSelectedAt ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!search.trim() && filtered.length > DEFAULT_VISIBLE && (
        <div className='flex justify-center'>
          <Button variant='outline' size='sm' onClick={() => setExpanded((v) => !v)}>
            {expanded ? '접기' : `전체 ${filtered.length}개 기관 보기`}
          </Button>
        </div>
      )}
    </div>
  );
}
