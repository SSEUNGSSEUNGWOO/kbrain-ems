'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

type Track = 'green' | 'blue' | 'expert' | 'continuing';

type Row = {
  key: string;
  applicantId: string;
  name: string;
  organization: string | null;
  department: string | null;
  jobTitle: string | null;
  year: number;
  track: Track;
  round: number | null;
  kind: string;
  certNo: string;
};

export type FilterOption = {
  value: string;
  label: string;
  count: number;
};

type Props = {
  rows: Row[];
  page: number;
  pageSize: number;
  pageCount: number;
  totalCount: number;
  search: string;
  yearFilter: string;
  trackFilter: string;
  kindFilter: string;
  yearOptions: FilterOption[];
  trackOptions: FilterOption[];
  kindOptions: FilterOption[];
};

const TRACK_LABEL: Record<Track, string> = {
  green: '그린',
  blue: '블루',
  expert: '전문인재',
  continuing: '보수교육'
};

const TRACK_TONE: Record<Track, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  expert: 'bg-violet-50 text-violet-700 border-violet-200',
  continuing: 'bg-slate-100 text-slate-600 border-slate-300'
};

export function CertifiedTable({
  rows,
  page,
  pageSize,
  pageCount,
  totalCount,
  search,
  yearFilter,
  trackFilter,
  kindFilter,
  yearOptions,
  trackOptions,
  kindOptions
}: Props) {
  const [{ q }, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      year: parseAsString.withDefault(''),
      track: parseAsString.withDefault(''),
      kind: parseAsString.withDefault(''),
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

  const onFilterChange = (name: 'year' | 'track' | 'kind', value: string) => {
    void setParams({ [name]: value || null, page: null });
  };

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), Math.max(1, pageCount));
    void setParams({ page: clamped === 1 ? null : clamped });
  };

  const isEmpty = rows.length === 0;
  const firstIndex = isEmpty ? 0 : (page - 1) * pageSize + 1;
  const lastIndex = isEmpty ? 0 : (page - 1) * pageSize + rows.length;
  const hasFilter =
    Boolean(search) || Boolean(yearFilter) || Boolean(trackFilter) || Boolean(kindFilter);

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
        <div className='relative w-full sm:w-80'>
          <Icons.search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            value={inputValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder='이름·기관·인증번호 검색'
            className='pr-8 pl-8'
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
        <FilterChipGroup
          options={yearOptions}
          active={yearFilter}
          onChange={(v) => onFilterChange('year', v)}
        />
        <FilterChipGroup
          options={trackOptions}
          active={trackFilter}
          onChange={(v) => onFilterChange('track', v)}
        />
        <FilterChipGroup
          options={kindOptions}
          active={kindFilter}
          onChange={(v) => onFilterChange('kind', v)}
        />
      </div>

      {isEmpty ? (
        <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
          <p className='text-foreground font-medium'>
            {hasFilter ? '검색 결과가 없습니다' : '인증자 데이터가 없습니다'}
          </p>
          {hasFilter && (
            <p className='text-muted-foreground mt-1 text-sm'>필터·검색어를 조정해보세요.</p>
          )}
        </div>
      ) : (
        <div className='overflow-x-auto rounded-md border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='px-4 py-2 text-left font-medium'>이름</th>
                <th className='px-4 py-2 text-left font-medium'>기관</th>
                <th className='px-4 py-2 text-left font-medium'>부서</th>
                <th className='px-4 py-2 text-left font-medium'>직급</th>
                <th className='px-4 py-2 text-left font-medium'>연도</th>
                <th className='px-4 py-2 text-left font-medium'>트랙</th>
                <th className='px-4 py-2 text-left font-medium'>유형</th>
                <th className='px-4 py-2 text-center font-medium'>회차</th>
                <th className='px-4 py-2 text-left font-medium'>인증번호</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className='hover:bg-muted/30 border-b last:border-0'>
                  <td className='px-4 py-2 font-medium'>
                    <Link
                      href={`/dashboard/applicants/${r.applicantId}`}
                      className='hover:underline'
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className='text-muted-foreground max-w-64 truncate px-4 py-2 text-xs'>
                    {r.organization ?? '—'}
                  </td>
                  <td className='text-muted-foreground max-w-40 truncate px-4 py-2 text-xs'>
                    {r.department ?? '—'}
                  </td>
                  <td className='text-muted-foreground px-4 py-2 text-xs'>{r.jobTitle ?? '—'}</td>
                  <td className='px-4 py-2 tabular-nums'>{r.year}</td>
                  <td className='px-4 py-2'>
                    <span
                      className={cn(
                        'inline-flex items-center rounded border px-1.5 py-px text-xs font-semibold',
                        TRACK_TONE[r.track]
                      )}
                    >
                      {TRACK_LABEL[r.track]}
                    </span>
                  </td>
                  <td className='text-muted-foreground px-4 py-2 text-xs'>{r.kind}</td>
                  <td className='text-muted-foreground px-4 py-2 text-center text-xs tabular-nums'>
                    {r.round ?? '—'}
                  </td>
                  <td className='text-muted-foreground px-4 py-2 text-xs tabular-nums'>
                    {r.certNo}
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
    </div>
  );
}

function FilterChipGroup({
  options,
  active,
  onChange
}: {
  options: FilterOption[];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <FilterChip
        active={!active}
        onClick={() => onChange('')}
        label='전체'
        count={options.reduce((s, o) => s + o.count, 0)}
      />
      {options.map((o) => (
        <FilterChip
          key={o.value}
          active={active === o.value}
          onClick={() => onChange(o.value)}
          label={o.label}
          count={o.count}
        />
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-input bg-background text-foreground hover:bg-muted/60'
      }`}
    >
      <span>{label}</span>
      <span className={`tabular-nums ${active ? 'opacity-80' : 'text-muted-foreground'}`}>
        {count.toLocaleString()}
      </span>
    </button>
  );
}
