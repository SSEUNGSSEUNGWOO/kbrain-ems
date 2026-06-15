'use client';

import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Icons } from '@/components/icons';

const ACTION_LABEL: Record<string, string> = {
  login: '로그인',
  create: '생성',
  update: '수정',
  delete: '삭제',
  publish: '발행',
  share_issue: '공유 발급',
  share_revoke: '공유 회수',
  auto_select: '자동선발',
  upload: '업로드',
  download: '다운로드'
};

const ACTION_TONE: Record<string, string> = {
  login: 'bg-slate-100 text-slate-700 border-slate-300',
  create: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update: 'bg-blue-50 text-blue-700 border-blue-200',
  delete: 'bg-rose-50 text-rose-700 border-rose-200',
  publish: 'bg-violet-50 text-violet-700 border-violet-200',
  share_issue: 'bg-amber-50 text-amber-700 border-amber-200',
  share_revoke: 'bg-slate-50 text-slate-600 border-slate-200',
  auto_select: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  upload: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  download: 'bg-teal-50 text-teal-700 border-teal-200'
};

type LogRow = {
  id: string;
  operator_name: string | null;
  action_type: string;
  resource_type: string | null;
  summary: string | null;
  created_at: string;
  cohort_id: string | null;
  cohorts: { name: string } | null;
};

type Props = {
  rows: LogRow[];
  page: number;
  pageSize: number;
  pageCount: number;
  totalCount: number;
  operatorOptions: string[];
  actionOptions: string[];
  cohortOptions: { id: string; name: string }[];
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

export function ActivityLogList({
  rows,
  page,
  pageSize,
  pageCount,
  totalCount,
  operatorOptions,
  actionOptions,
  cohortOptions
}: Props) {
  const [{ operator, action, cohort, from, to }, setParams] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      operator: parseAsString.withDefault(''),
      action: parseAsString.withDefault(''),
      cohort: parseAsString.withDefault(''),
      from: parseAsString.withDefault(''),
      to: parseAsString.withDefault('')
    },
    { shallow: false }
  );

  const cohortNameById = new Map(cohortOptions.map((c) => [c.id, c.name]));

  const onFilter = (key: 'operator' | 'action' | 'cohort' | 'from' | 'to', value: string) => {
    void setParams({ [key]: value || null, page: null });
  };

  const onResetAll = () => {
    void setParams({
      operator: null,
      action: null,
      cohort: null,
      from: null,
      to: null,
      page: null
    });
  };

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), Math.max(1, pageCount));
    void setParams({ page: clamped === 1 ? null : clamped });
  };

  const hasFilter = Boolean(operator || action || cohort || from || to);
  const isEmpty = rows.length === 0;
  const firstIndex = isEmpty ? 0 : (page - 1) * pageSize + 1;
  const lastIndex = isEmpty ? 0 : (page - 1) * pageSize + rows.length;

  return (
    <section className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-end gap-2'>
        <FilterField label='운영자'>
          <Select
            value={operator || 'all'}
            onValueChange={(v) => onFilter('operator', v === 'all' ? '' : v)}
          >
            <SelectTrigger className='h-9 w-40'>
              <SelectValue placeholder='전체' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>전체</SelectItem>
              {operatorOptions.map((op) => (
                <SelectItem key={op} value={op}>
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label='작업'>
          <Select
            value={action || 'all'}
            onValueChange={(v) => onFilter('action', v === 'all' ? '' : v)}
          >
            <SelectTrigger className='h-9 w-36'>
              <SelectValue placeholder='전체' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>전체</SelectItem>
              {actionOptions.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_LABEL[a] ?? a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label='기수'>
          <Select
            value={cohort || 'all'}
            onValueChange={(v) => onFilter('cohort', v === 'all' ? '' : v)}
          >
            <SelectTrigger className='h-9 w-56'>
              <SelectValue placeholder='전체' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>전체</SelectItem>
              {cohortOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label='시작'>
          <Input
            type='date'
            value={from}
            max={to || undefined}
            onChange={(e) => onFilter('from', e.target.value)}
            className='h-9 w-40'
          />
        </FilterField>

        <FilterField label='종료'>
          <Input
            type='date'
            value={to}
            min={from || undefined}
            onChange={(e) => onFilter('to', e.target.value)}
            className='h-9 w-40'
          />
        </FilterField>

        {hasFilter && (
          <Button variant='ghost' size='sm' onClick={onResetAll} className='h-9'>
            <Icons.close className='mr-1 size-3.5' />
            초기화
          </Button>
        )}
      </div>

      {isEmpty ? (
        <div className='text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm'>
          {hasFilter ? '조건에 맞는 로그가 없습니다.' : '기록된 활동이 아직 없습니다.'}
        </div>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50'>
              <tr>
                <th className='border-b px-4 py-3 text-left font-medium'>시각</th>
                <th className='border-b px-4 py-3 text-left font-medium'>운영자</th>
                <th className='border-b px-4 py-3 text-left font-medium'>작업</th>
                <th className='border-b px-4 py-3 text-left font-medium'>요약</th>
                <th className='border-b px-4 py-3 text-left font-medium'>기수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className='even:bg-muted/10'>
                  <td className='text-muted-foreground border-b px-4 py-2 text-xs tabular-nums'>
                    {formatTime(r.created_at)}
                  </td>
                  <td className='border-b px-4 py-2'>
                    {r.operator_name ?? <span className='text-muted-foreground'>(미상)</span>}
                  </td>
                  <td className='border-b px-4 py-2'>
                    <Badge
                      variant='outline'
                      className={`font-normal ${ACTION_TONE[r.action_type] ?? ''}`}
                    >
                      {ACTION_LABEL[r.action_type] ?? r.action_type}
                    </Badge>
                  </td>
                  <td className='border-b px-4 py-2'>
                    {r.summary ?? (
                      <span className='text-muted-foreground text-xs'>{r.resource_type ?? '—'}</span>
                    )}
                  </td>
                  <td className='text-muted-foreground border-b px-4 py-2 text-xs'>
                    {r.cohorts?.name ?? (r.cohort_id ? cohortNameById.get(r.cohort_id) : null) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </section>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='flex flex-col gap-1'>
      <span className='text-muted-foreground text-[11px] font-medium'>{label}</span>
      {children}
    </label>
  );
}
