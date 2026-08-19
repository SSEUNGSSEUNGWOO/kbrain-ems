'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { QuotaRatio, ScoreWeights } from '../_selection-logic';

type Props = {
  poolSize: number;
  totalCapacity: number;
  onTotalChange: (v: number) => void;
  withReserve: boolean;
  onWithReserveChange: (v: boolean) => void;
  effectiveCapacity: number;
  weights: ScoreWeights;
  onWeightChange: (key: keyof ScoreWeights, value: number) => void;
  quotaRatio: QuotaRatio;
  onQuotaChange: (key: keyof QuotaRatio, value: number) => void;
  maxPerOrg: number;
  onMaxPerOrgChange: (v: number) => void;
  parentOrgCapInput: number;
  onParentOrgCapInputChange: (v: number) => void;
};

/** Step 2 — 선발 조건. 평소엔 정원·예비만, 나머지는 고급 설정 접힘 안에. */
export function SelectionConfigStep(p: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const wSum = p.weights.knowledge + p.weights.plan;
  const rSum = p.quotaRatio.central + p.quotaRatio.local + p.quotaRatio.public_edu;

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-col gap-3 rounded-md border p-3'>
        <div className='flex items-center gap-3'>
          <label htmlFor='total-capacity' className='text-sm font-medium'>
            총 정원
          </label>
          <Input
            id='total-capacity'
            type='number'
            value={p.totalCapacity}
            onChange={(e) => p.onTotalChange(Number(e.target.value) || 0)}
            className='h-8 w-24 tabular-nums'
          />
          <label
            htmlFor='with-reserve'
            className='flex cursor-pointer items-center gap-1.5 text-sm'
            title='정원의 110%를 선발 (예비합격자 포함)'
          >
            <Checkbox
              id='with-reserve'
              checked={p.withReserve}
              onCheckedChange={(v) => p.onWithReserveChange(v === true)}
            />
            <span>110% 선발</span>
            {p.withReserve && p.effectiveCapacity !== p.totalCapacity && (
              <span className='text-muted-foreground tabular-nums'>({p.effectiveCapacity}명)</span>
            )}
          </label>
          <span className='text-muted-foreground ml-auto text-xs'>선발 대상 풀 {p.poolSize}명</span>
        </div>
      </div>

      <div className='rounded-md border'>
        <button
          type='button'
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className='hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left text-sm'
        >
          <Icons.chevronRight
            className={cn(
              'text-muted-foreground size-3.5 transition-transform',
              advancedOpen && 'rotate-90'
            )}
          />
          <span className='font-medium'>고급 설정</span>
          <span className='text-muted-foreground text-xs'>
            가중치 {p.weights.knowledge}:{p.weights.plan} · 비율 {p.quotaRatio.central}:
            {p.quotaRatio.local}:{p.quotaRatio.public_edu} · 기관당 {p.maxPerOrg || '∞'}
            {p.parentOrgCapInput > 0 && ` · 상위부처 ${p.parentOrgCapInput}`}
          </span>
        </button>
        {advancedOpen && (
          <div className='flex flex-col gap-3 border-t p-3'>
            <div className='flex flex-col gap-1.5'>
              <div className='text-muted-foreground text-xs font-medium'>점수 가중치</div>
              <div className='grid grid-cols-2 gap-2'>
                <NumberField
                  id='w-knowledge'
                  label='시험 점수 (지식)'
                  value={p.weights.knowledge}
                  max={100}
                  onChange={(v) => p.onWeightChange('knowledge', v)}
                />
                <NumberField
                  id='w-plan'
                  label='정성평가 (체크, 글자수)'
                  value={p.weights.plan}
                  max={100}
                  onChange={(v) => p.onWeightChange('plan', v)}
                />
              </div>
              <div className='text-muted-foreground text-xs'>
                합계 {wSum} · 합이 100이 아니어도 자동 정규화됩니다.
              </div>
            </div>

            <div className='flex flex-col gap-1.5'>
              <div className='text-muted-foreground text-xs font-medium'>부처 정원 비율</div>
              <div className='grid grid-cols-3 gap-2'>
                <NumberField
                  id='r-central'
                  label='중앙부처'
                  value={p.quotaRatio.central}
                  onChange={(v) => p.onQuotaChange('central', v)}
                />
                <NumberField
                  id='r-local'
                  label='지자체 (광역+기초)'
                  value={p.quotaRatio.local}
                  onChange={(v) => p.onQuotaChange('local', v)}
                />
                <NumberField
                  id='r-public'
                  label='공공·교육'
                  value={p.quotaRatio.public_edu}
                  onChange={(v) => p.onQuotaChange('public_edu', v)}
                />
              </div>
              <div className='text-muted-foreground text-xs'>
                합계 {rSum} · 비율 기준으로 쿼터 분배 (기본 5:3:2)
              </div>
            </div>

            <div className='grid grid-cols-2 gap-2'>
              <NumberField
                id='max-per-org'
                label='기관당 최대 (0 = 무제한)'
                value={p.maxPerOrg}
                onChange={p.onMaxPerOrgChange}
              />
              <NumberField
                id='parent-org-cap'
                label='상위부처당 최대 (0 = 비활성)'
                value={p.parentOrgCapInput}
                onChange={p.onParentOrgCapInputChange}
              />
            </div>
            <div className='text-muted-foreground text-xs'>
              상위부처는 기관명 첫 공백 앞으로 그룹핑 (예: &apos;경찰청 서울특별시경찰청&apos; →
              &apos;경찰청&apos;)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  max,
  onChange
}: {
  id: string;
  label: string;
  value: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className='flex flex-col gap-1'>
      <label htmlFor={id} className='text-muted-foreground text-xs'>
        {label}
      </label>
      <Input
        id={id}
        type='number'
        value={value}
        min={0}
        max={max}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className='h-8 w-full tabular-nums'
      />
    </div>
  );
}
