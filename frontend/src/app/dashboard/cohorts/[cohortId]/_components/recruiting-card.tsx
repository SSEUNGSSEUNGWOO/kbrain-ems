'use client';

import { useEffect, useState } from 'react';
import { Icons } from '@/components/icons';

type Props = {
  slug: string;
  applicationStartAt: string | null;
  applicationEndAt: string | null;
  applicantCount: number;
  maxCapacity: number | null;
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

export function RecruitingCard({
  slug,
  applicationStartAt,
  applicationEndAt,
  applicantCount,
  maxCapacity
}: Props) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = origin ? `${origin}/apply/${slug}` : `…/apply/${slug}`;
  const remaining = daysUntil(applicationEndAt);
  const fillRate = maxCapacity && maxCapacity > 0
    ? Math.round((applicantCount / maxCapacity) * 100)
    : null;

  const copy = async () => {
    if (!origin) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className='mb-8 rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50/70 to-white px-6 py-5 dark:border-orange-900/40 dark:from-orange-950/20 dark:to-background'>
      <div className='mb-4 flex items-center gap-2'>
        <span className='rounded-md bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'>
          모집중
        </span>
        <h3 className='text-sm font-semibold'>지원자 모집 진행 중</h3>
      </div>

      {/* 지표 */}
      <div className='mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3'>
        <div className='rounded-lg border bg-card px-4 py-3'>
          <div className='text-muted-foreground text-[11px] font-medium'>신청자</div>
          <div className='mt-1 text-2xl font-bold'>
            {applicantCount}
            <span className='text-muted-foreground ml-1 text-base font-normal'>
              {maxCapacity ? `/ ${maxCapacity}명` : '명'}
            </span>
          </div>
          {fillRate != null && (
            <div className='bg-muted mt-2 h-1.5 overflow-hidden rounded-full'>
              <div
                className='h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600'
                style={{ width: `${Math.min(fillRate, 100)}%` }}
              />
            </div>
          )}
        </div>

        <div className='rounded-lg border bg-card px-4 py-3'>
          <div className='text-muted-foreground text-[11px] font-medium'>모집 마감</div>
          <div className='mt-1 text-2xl font-bold'>
            {applicationEndAt ?? '-'}
          </div>
          {remaining != null && (
            <div className='text-muted-foreground mt-2 text-xs'>
              {remaining > 0
                ? `D-${remaining}`
                : remaining === 0
                ? '오늘 마감'
                : `마감 ${-remaining}일 경과`}
            </div>
          )}
        </div>

        <div className='col-span-2 rounded-lg border bg-card px-4 py-3 sm:col-span-1'>
          <div className='text-muted-foreground text-[11px] font-medium'>모집 기간</div>
          <div className='mt-1 text-sm font-medium'>
            {applicationStartAt ?? '-'}
            <span className='text-muted-foreground mx-1'>~</span>
            {applicationEndAt ?? '-'}
          </div>
        </div>
      </div>

      {/* 신청 링크 */}
      <div>
        <div className='text-muted-foreground mb-1.5 text-[11px] font-medium'>외부 신청 페이지</div>
        <div className='flex items-stretch gap-2'>
          <input
            type='text'
            value={url}
            readOnly
            className='min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs'
          />
          <button
            type='button'
            onClick={copy}
            disabled={!origin}
            className='inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50'
          >
            {copied ? (
              <>
                <Icons.check className='h-3.5 w-3.5' />
                복사됨
              </>
            ) : (
              <>
                <Icons.clipboardText className='h-3.5 w-3.5' />
                복사
              </>
            )}
          </button>
          {origin && (
            <a
              href={url}
              target='_blank'
              rel='noreferrer'
              className='inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-3 py-2 text-xs font-semibold transition hover:bg-accent'
            >
              <Icons.externalLink className='h-3.5 w-3.5' />
              열기
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
