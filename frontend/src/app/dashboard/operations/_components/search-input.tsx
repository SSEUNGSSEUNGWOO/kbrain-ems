'use client';

import { useEffect, useState } from 'react';
import { parseAsString, useQueryState } from 'nuqs';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

export function SearchInput() {
  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({ shallow: false })
  );

  const [inputValue, setInputValue] = useState(q);
  useEffect(() => {
    setInputValue(q);
  }, [q]);

  const debouncedSet = useDebouncedCallback((value: string) => {
    void setQ(value || null);
  }, 300);

  const onChange = (value: string) => {
    setInputValue(value);
    debouncedSet(value);
  };

  const onClear = () => {
    setInputValue('');
    void setQ(null);
  };

  return (
    <div className='relative w-full sm:w-72'>
      <Icons.search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
      <Input
        value={inputValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder='과정·회차·강사·운영자 검색'
        className='pl-8 pr-8'
      />
      {inputValue && (
        <button
          type='button'
          onClick={onClear}
          className='text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2'
          aria-label='검색어 지우기'
        >
          <Icons.close className='size-4' />
        </button>
      )}
    </div>
  );
}
