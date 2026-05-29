'use client';

import { useEffect, useState } from 'react';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

type Row = {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  courses: { code: string; name: string; completed_at: string | null }[];
  lastCompletedAt: string | null;
  isApplicant: boolean;
};

type Props = {
  rows: Row[];
  page: number;
  pageSize: number;
  pageCount: number;
  totalCount: number;
  search: string;
};

export function LmsCompletionsTable({
  rows,
  page,
  pageSize,
  pageCount,
  totalCount,
  search
}: Props) {
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
  const hasSearch = Boolean(search);

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative w-full sm:w-80'>
          <Icons.search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            value={inputValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder='이름·휴대폰·이메일 검색'
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
          <p className='text-foreground font-medium'>
            {hasSearch ? '검색 결과가 없습니다' : '아직 LMS 명단이 없습니다'}
          </p>
          <p className='text-muted-foreground mt-1 text-sm'>
            {hasSearch ? '다른 검색어를 시도해보세요.' : '우상단 "명단 업로드"로 시작하세요.'}
          </p>
        </div>
      ) : (
        <div className='overflow-x-auto rounded-md border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='px-4 py-2 text-left font-medium'>이름</th>
                <th className='px-4 py-2 text-left font-medium'>휴대폰</th>
                <th className='px-4 py-2 text-left font-medium'>이메일</th>
                <th className='px-4 py-2 text-left font-medium'>수료 과목</th>
                <th className='px-4 py-2 text-left font-medium'>최종 이수일</th>
                <th className='px-4 py-2 text-center font-medium'>신청자</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className='hover:bg-muted/30 border-b last:border-0'>
                  <td className='px-4 py-2 font-medium'>{r.name}</td>
                  <td className='text-muted-foreground px-4 py-2 tabular-nums'>
                    {r.phone ?? '—'}
                  </td>
                  <td className='text-muted-foreground px-4 py-2 text-xs'>{r.email ?? '—'}</td>
                  <td className='px-4 py-2'>
                    <div className='flex flex-wrap gap-1'>
                      {r.courses.map((c) => (
                        <Badge
                          key={c.code}
                          variant='outline'
                          className='border-emerald-200 bg-emerald-50 text-emerald-700 font-normal'
                        >
                          {c.name}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className='text-muted-foreground px-4 py-2 text-xs tabular-nums'>
                    {r.lastCompletedAt ?? '—'}
                  </td>
                  <td className='px-4 py-2 text-center'>
                    {r.isApplicant ? (
                      <Badge
                        variant='outline'
                        className='border-blue-200 bg-blue-50 text-blue-700'
                      >
                        ✓
                      </Badge>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
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
            {totalCount.toLocaleString()}명
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
