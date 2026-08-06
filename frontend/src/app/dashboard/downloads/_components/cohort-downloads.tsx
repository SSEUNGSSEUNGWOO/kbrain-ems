'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Icons } from '@/components/icons';

export type CohortOption = {
  id: string;
  name: string;
  category: string | null;
  startedAt: string | null;
};

type Item = {
  label: string;
  desc: string;
  path: (id: string) => string;
};

const ITEMS: Item[] = [
  {
    label: '선발 명단',
    desc: '선발자·미선발자 시트 + 선발 기준 요약 (미선발 사유 포함)',
    path: (id) => `/api/cohorts/${id}/applications/export`
  },
  {
    label: '통보 명단',
    desc: '선발·미선발 통보용 — 이름·분류·소속·연락처',
    path: (id) => `/api/cohorts/${id}/applications/notice-export`
  },
  {
    label: '교육생 명단',
    desc: '수강 확정 교육생 명단 (당일취소 제외)',
    path: (id) => `/api/cohorts/${id}/students/export-simple`
  },
  {
    label: '교육생 명단 (당일취소 포함)',
    desc: '당일취소자까지 포함한 전체 명단',
    path: (id) => `/api/cohorts/${id}/students/export-simple?includeCancel=1`
  },
  {
    label: '출석 현황',
    desc: '회차별 출결 집계표',
    path: (id) => `/api/cohorts/${id}/attendance/export`
  },
  {
    label: '수료자 명단',
    desc: '수료 판정 결과 — 미수료자 사유 포함',
    path: (id) => `/api/cohorts/${id}/completion/export`
  }
];

const CATEGORY_LABEL: Record<string, string> = {
  champion: 'AI 챔피언',
  general: '일반교육',
  special: '특화교육',
  experts: '전문인재'
};

export function CohortDownloads({ cohorts }: { cohorts: CohortOption[] }) {
  const [cohortId, setCohortId] = useState<string>(cohorts[0]?.id ?? '');
  const selected = cohorts.find((c) => c.id === cohortId);

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Select value={cohortId} onValueChange={setCohortId}>
          <SelectTrigger className='w-full sm:w-96'>
            <SelectValue placeholder='기수를 선택하세요' />
          </SelectTrigger>
          <SelectContent>
            {cohorts.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.startedAt ? ` · ${c.startedAt.slice(2).replace(/-/g, '.')}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected?.category && (
          <span className='text-muted-foreground text-xs'>
            {CATEGORY_LABEL[selected.category] ?? selected.category}
          </span>
        )}
      </div>

      <div className='grid gap-2 sm:grid-cols-2'>
        {ITEMS.map((item) => (
          <div
            key={item.label}
            className='flex items-start justify-between gap-3 rounded-lg border px-4 py-3'
          >
            <div className='min-w-0'>
              <p className='text-sm font-medium'>{item.label}</p>
              <p className='text-muted-foreground mt-0.5 text-xs'>{item.desc}</p>
            </div>
            <Button variant='outline' size='sm' asChild disabled={!cohortId}>
              <a href={cohortId ? item.path(cohortId) : '#'} download>
                <Icons.download className='mr-1.5' />
                받기
              </a>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
