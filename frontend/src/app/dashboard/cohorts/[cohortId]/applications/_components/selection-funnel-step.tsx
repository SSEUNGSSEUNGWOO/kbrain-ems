'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/icons';
import type { ExclusionStage } from '../_selection-logic';

type Props = {
  totalApplicants: number; // 서버 사전제외 포함 전체 지원자 수
  preExcluded: { name: string; reason: string }[];
  stages: ExclusionStage[];
  poolCount: number;
  exceptions: Set<string>;
  onToggleException: (applicationId: string) => void;
  availableExclusionCohorts: { id: string; name: string }[];
  excludedCohortIds: Set<string>;
  onToggleExclusionCohort: (id: string) => void;
};

/**
 * Step 1 — 깔때기: 하드 제외 규칙을 위에서 아래로 통과시키며
 * 단계마다 "−몇 명 → 몇 명"을 보여준다. 행을 펼치면 빠진 사람 명단과
 * 개별 "예외 허용" 체크가 나온다 (예외는 모든 규칙 통과).
 */
export function SelectionFunnelStep({
  totalApplicants,
  preExcluded,
  stages,
  poolCount,
  exceptions,
  onToggleException,
  availableExclusionCohorts,
  excludedCohortIds,
  onToggleExclusionCohort
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  // 위에서부터의 누적 잔여 인원
  let running = totalApplicants - preExcluded.length;
  const rows = stages.map((s) => {
    const after = running - s.excluded.length;
    const row = { stage: s, before: running, after };
    running = after;
    return row;
  });

  return (
    <div className='flex flex-col gap-1 rounded-md border p-3'>
      <div className='flex items-baseline gap-2 pb-2'>
        <span className='text-sm font-medium'>지원자</span>
        <span className='text-lg font-semibold tabular-nums'>{totalApplicants}명</span>
        <span className='text-muted-foreground text-xs'>
          — 아래 규칙을 순서대로 통과한 사람이 선발 대상 풀이 됩니다
        </span>
      </div>

      {preExcluded.length > 0 && (
        <FunnelRow
          label='테스트·대상아님 제외'
          hint='서버에서 자동 적용 (excluded_reason) — 예외 불가'
          minus={preExcluded.length}
          after={totalApplicants - preExcluded.length}
          open={openKey === 'pre'}
          onToggleOpen={() => setOpenKey((k) => (k === 'pre' ? null : 'pre'))}
        >
          <ul className='flex flex-col gap-0.5 text-xs'>
            {preExcluded.map((p, i) => (
              <li key={`${p.name}-${i}`} className='text-muted-foreground'>
                {p.name} <span className='opacity-60'>· {p.reason}</span>
              </li>
            ))}
          </ul>
        </FunnelRow>
      )}

      {rows.map(({ stage, after }) => (
        <FunnelRow
          key={stage.key}
          label={stage.label}
          minus={stage.excluded.length}
          after={after}
          open={openKey === stage.key}
          onToggleOpen={() => setOpenKey((k) => (k === stage.key ? null : stage.key))}
        >
          {stage.key === 'other_cohort' && (
            <div className='mb-2 flex flex-col gap-1 border-b pb-2'>
              <div className='text-muted-foreground text-xs font-medium'>
                제외할 기수 선택 — 체크한 기수에서 이미 선발된 지원자가 빠집니다
              </div>
              {availableExclusionCohorts.length === 0 ? (
                <div className='text-muted-foreground text-xs italic'>
                  중복 지원자가 있는 다른 기수가 없습니다.
                </div>
              ) : (
                availableExclusionCohorts.map((c) => (
                  <label key={c.id} className='flex cursor-pointer items-center gap-2 text-xs'>
                    <Checkbox
                      checked={excludedCohortIds.has(c.id)}
                      onCheckedChange={() => onToggleExclusionCohort(c.id)}
                    />
                    <span>{c.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
          {stage.excluded.length === 0 ? (
            <div className='text-muted-foreground text-xs italic'>이 단계에서 빠진 사람 없음</div>
          ) : (
            <ul className='flex max-h-48 flex-col gap-0.5 overflow-y-auto text-xs'>
              {stage.excluded.map((c) => (
                <li key={c.application_id}>
                  <label className='flex cursor-pointer items-center gap-2'>
                    <Checkbox
                      checked={exceptions.has(c.application_id)}
                      onCheckedChange={() => onToggleException(c.application_id)}
                    />
                    <span className='font-medium'>{c.name}</span>
                    <span className='text-muted-foreground truncate'>{c.organization ?? '—'}</span>
                    <span className='text-muted-foreground ml-auto shrink-0 opacity-70'>
                      예외 허용
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </FunnelRow>
      ))}

      <div className='mt-1 flex items-baseline gap-2 border-t pt-2'>
        <span className='text-sm font-medium text-emerald-700'>선발 대상 풀</span>
        <span className='text-lg font-semibold tabular-nums text-emerald-700'>{poolCount}명</span>
        {exceptions.size > 0 && (
          <span className='text-xs text-amber-700'>예외 허용 {exceptions.size}명 포함</span>
        )}
      </div>
    </div>
  );
}

function FunnelRow({
  label,
  hint,
  minus,
  after,
  open,
  onToggleOpen,
  children
}: {
  label: string;
  hint?: string;
  minus: number;
  after: number;
  open: boolean;
  onToggleOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className='rounded border'>
      <button
        type='button'
        onClick={onToggleOpen}
        aria-expanded={open}
        className='hover:bg-muted/40 flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm'
      >
        <Icons.chevronRight
          className={cn('text-muted-foreground size-3.5 transition-transform', open && 'rotate-90')}
        />
        <span>{label}</span>
        {hint && <span className='text-muted-foreground hidden text-[11px] sm:inline'>{hint}</span>}
        <span
          className={cn(
            'ml-auto tabular-nums',
            minus > 0 ? 'font-medium text-rose-600' : 'text-muted-foreground'
          )}
        >
          −{minus}
        </span>
        <span className='text-muted-foreground w-16 text-right tabular-nums'>→ {after}명</span>
      </button>
      {open && <div className='border-t px-3 py-2'>{children}</div>}
    </div>
  );
}
