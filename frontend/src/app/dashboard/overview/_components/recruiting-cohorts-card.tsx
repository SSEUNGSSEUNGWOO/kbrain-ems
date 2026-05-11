'use client';

import { useEffect, useState } from 'react';

type RecruitingCohort = {
  id: string;
  name: string;
  slug: string;
  applicationEndAt: string | null;
  applicantCount: number;
  maxCapacity: number | null;
};

type Props = {
  cohorts: RecruitingCohort[];
};

export function RecruitingCohortsCard({ cohorts }: Props) {
  const [origin, setOrigin] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (cohorts.length === 0) return null;

  const copy = async (id: string, slug: string) => {
    if (!origin) return;
    try {
      await navigator.clipboard.writeText(`${origin}/apply/${slug}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className='mb-8 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white px-6 py-5 dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-background'>
      <div className='mb-4 flex items-center gap-2'>
        <span className='rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'>
          모집중
        </span>
        <h3 className='text-sm font-semibold'>현재 신청 받는 교육과정 {cohorts.length}개</h3>
      </div>

      <div className='space-y-3'>
        {cohorts.map((c) => {
          const url = origin ? `${origin}/apply/${c.slug}` : `…/apply/${c.slug}`;
          const isCopied = copiedId === c.id;
          return (
            <div key={c.id} className='rounded-lg border bg-card p-4'>
              <div className='mb-2 flex items-center justify-between gap-2'>
                <div>
                  <div className='font-semibold'>{c.name}</div>
                  <div className='mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground'>
                    {c.applicationEndAt && <span>마감 {c.applicationEndAt}</span>}
                    <span>
                      신청 {c.applicantCount}명
                      {c.maxCapacity ? ` / ${c.maxCapacity}` : ''}
                    </span>
                  </div>
                </div>
              </div>
              <div className='flex items-stretch gap-2'>
                <input
                  type='text'
                  value={url}
                  readOnly
                  className='min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs'
                />
                <button
                  type='button'
                  onClick={() => copy(c.id, c.slug)}
                  disabled={!origin}
                  className='shrink-0 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50'
                >
                  {isCopied ? '✓ 복사됨' : '복사'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
