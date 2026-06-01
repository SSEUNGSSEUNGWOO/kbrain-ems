'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { loadSelectionPool, applySelections } from '../_actions';
import {
  type CandidateRow,
  type QuotaRatio,
  type ScoredCandidate,
  type ScoreWeights,
  type SelectionCategory,
  DEFAULT_QUOTA_RATIO,
  DEFAULT_WEIGHTS,
  SELECTION_CATEGORY_LABEL,
  SELECTION_CATEGORY_ORDER,
  computeQuotas,
  distributeByCategory,
  recommendByQuotas
} from '../_selection-logic';

type Props = {
  cohortId: string;
  defaultCapacity: number;
  trigger: React.ReactNode;
};

type Stage = 'idle' | 'loading' | 'editing' | 'applying' | 'done';

export function SelectionSheet({ cohortId, defaultCapacity, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [knowledgeMax, setKnowledgeMax] = useState(10);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [quotaRatio, setQuotaRatio] = useState<QuotaRatio>(DEFAULT_QUOTA_RATIO);
  const [totalCapacity, setTotalCapacity] = useState(defaultCapacity);
  const [withReserve, setWithReserve] = useState(true);
  const [maxPerOrg, setMaxPerOrg] = useState(3);
  const [excludeNoPrereq, setExcludeNoPrereq] = useState(true);
  const [filterCategory, setFilterCategory] = useState<SelectionCategory | null>(null);

  // 110% 선발 시 실제 사용되는 정원 (예: 100 → 110). 미체크면 입력값 그대로.
  const effectiveCapacity = useMemo(
    () => (withReserve ? Math.ceil(totalCapacity * 1.1) : totalCapacity),
    [totalCapacity, withReserve]
  );
  const [manualToggles, setManualToggles] = useState<Map<string, boolean>>(new Map());
  const [rejectOthers, setRejectOthers] = useState(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ selectedCount?: number; rejectedCount?: number } | null>(
    null
  );

  // 시트 열림 → 풀 로드
  useEffect(() => {
    if (!open || stage !== 'idle') return;
    setStage('loading');
    setError(null);
    (async () => {
      const res = await loadSelectionPool(cohortId);
      if (res.error || !res.candidates) {
        setError(res.error ?? '풀 로드 실패');
        setStage('idle');
        return;
      }
      setCandidates(res.candidates);
      if (res.knowledgeMax && res.knowledgeMax > 0) setKnowledgeMax(res.knowledgeMax);
      setStage('editing');
    })();
  }, [open, stage, cohortId]);

  // 가중치·정원·쿼터 변하면 자동 추천 (수동 토글이 있는 사람은 그 결정을 유지)
  const { scored, autoSelectedIds } = useMemo(() => {
    if (candidates.length === 0) {
      return { scored: [] as ScoredCandidate[], autoSelectedIds: new Set<string>() };
    }
    const { selectedIds, scored } = recommendByQuotas(
      candidates,
      weights,
      effectiveCapacity,
      knowledgeMax,
      quotaRatio,
      maxPerOrg,
      excludeNoPrereq
    );
    return { scored, autoSelectedIds: new Set(selectedIds) };
  }, [candidates, weights, effectiveCapacity, knowledgeMax, quotaRatio, maxPerOrg, excludeNoPrereq]);

  // 최종 선택 = 자동추천 ⊕ 수동토글 오버라이드
  const effectiveSelectedIds = useMemo(() => {
    const next = new Set<string>(autoSelectedIds);
    for (const [id, on] of manualToggles.entries()) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return next;
  }, [autoSelectedIds, manualToggles]);

  const distribution = useMemo(
    () => distributeByCategory(scored, [...effectiveSelectedIds]),
    [scored, effectiveSelectedIds]
  );

  const quotas = useMemo(
    () => computeQuotas(effectiveCapacity, quotaRatio),
    [effectiveCapacity, quotaRatio]
  );

  const poolByCategory = useMemo(() => {
    const result: Record<SelectionCategory, number> = {
      central: 0,
      local: 0,
      public_edu: 0,
      other: 0
    };
    for (const c of candidates) result[c.category]++;
    return result;
  }, [candidates]);

  const reset = () => {
    setStage('idle');
    setCandidates([]);
    setManualToggles(new Map());
    setResult(null);
    setError(null);
    setWeights(DEFAULT_WEIGHTS);
    setQuotaRatio(DEFAULT_QUOTA_RATIO);
    setTotalCapacity(defaultCapacity);
    setWithReserve(true);
    setMaxPerOrg(3);
    setExcludeNoPrereq(true);
    setFilterCategory(null);
  };

  const onWeightChange = (key: keyof ScoreWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, value)) }));
    setManualToggles(new Map()); // 가중치 바꾸면 수동 토글 초기화
  };

  const onQuotaChange = (key: keyof QuotaRatio, value: number) => {
    setQuotaRatio((prev) => ({ ...prev, [key]: Math.max(0, value) }));
    setManualToggles(new Map());
  };

  const toggle = (id: string) => {
    setManualToggles((prev) => {
      const next = new Map(prev);
      const currentAuto = autoSelectedIds.has(id);
      const currentEffective = effectiveSelectedIds.has(id);
      // 다음 상태는 현재 effective의 반대
      const desired = !currentEffective;
      if (desired === currentAuto) {
        next.delete(id); // 자동과 일치 → 오버라이드 해제
      } else {
        next.set(id, desired);
      }
      return next;
    });
  };

  const onConfirm = () => {
    setStage('applying');
    setError(null);
    startTransition(async () => {
      const res = await applySelections(cohortId, [...effectiveSelectedIds], rejectOthers);
      if (res.error) {
        setError(res.error);
        setStage('editing');
        return;
      }
      setResult({ selectedCount: res.selectedCount, rejectedCount: res.rejectedCount });
      setStage('done');
      router.refresh();
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className='flex w-full max-w-3xl flex-col gap-0 overflow-hidden sm:max-w-3xl'>
        <SheetHeader className='border-b'>
          <SheetTitle>자동 선발</SheetTitle>
          <SheetDescription>
            사전학습 수료 단계 → 부처 쿼터 → 점수순으로 채웁니다. 쿼터 미달 시 아래 카테고리로 흘러내림.
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-y-auto'>
          {stage === 'loading' && (
            <div className='flex flex-col items-center gap-2 py-12'>
              <Icons.spinner className='size-6 animate-spin' />
              <div className='text-sm'>풀 로드 중...</div>
            </div>
          )}

          {error && (
            <div className='text-destructive border-destructive/30 bg-destructive/5 m-4 rounded border p-3 text-sm'>
              {error}
            </div>
          )}

          {(stage === 'editing' || stage === 'applying') && (
            <div className='flex flex-col gap-4 p-4'>
              <WeightPanel
                weights={weights}
                onChange={onWeightChange}
                quotaRatio={quotaRatio}
                onQuotaChange={onQuotaChange}
                totalCapacity={totalCapacity}
                onTotalChange={(v) => {
                  setTotalCapacity(Math.max(0, v));
                  setManualToggles(new Map());
                }}
                withReserve={withReserve}
                onWithReserveChange={(v) => {
                  setWithReserve(v);
                  setManualToggles(new Map());
                }}
                effectiveCapacity={effectiveCapacity}
                maxPerOrg={maxPerOrg}
                onMaxPerOrgChange={(v) => {
                  setMaxPerOrg(Math.max(0, v));
                  setManualToggles(new Map());
                }}
                excludeNoPrereq={excludeNoPrereq}
                onExcludeNoPrereqChange={(v) => {
                  setExcludeNoPrereq(v);
                  setManualToggles(new Map());
                }}
                poolSize={candidates.length}
                selectedCount={effectiveSelectedIds.size}
              />

              <DistributionRow
                distribution={distribution}
                poolByCategory={poolByCategory}
                quotas={quotas}
                totalCapacity={effectiveCapacity}
                activeCategory={filterCategory}
                onCategoryClick={(cat) =>
                  setFilterCategory((prev) => (prev === cat ? null : cat))
                }
              />

              <CandidateList
                scored={scored}
                autoSelectedIds={autoSelectedIds}
                effectiveSelectedIds={effectiveSelectedIds}
                onToggle={toggle}
                totalCapacity={effectiveCapacity}
                filterCategory={filterCategory}
              />
            </div>
          )}

          {stage === 'done' && result && (
            <div className='flex flex-col items-center gap-3 py-12'>
              <div className='flex items-center gap-2 font-medium text-emerald-600'>
                <Icons.check className='size-5' /> 확정 완료
              </div>
              <div className='text-sm'>
                선발 {result.selectedCount ?? 0}명
                {result.rejectedCount ? ` · 탈락 ${result.rejectedCount}명` : ''}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className='border-t'>
          {stage === 'editing' && (
            <div className='flex w-full items-center justify-between gap-3'>
              <div className='flex items-center gap-2 text-sm'>
                <Checkbox
                  id='reject-others'
                  checked={rejectOthers}
                  onCheckedChange={(v) => setRejectOthers(v === true)}
                />
                <label htmlFor='reject-others' className='cursor-pointer'>
                  미선택자 자동 탈락
                </label>
              </div>
              <div className='flex gap-2'>
                <Button variant='outline' onClick={() => setOpen(false)} disabled={pending}>
                  취소
                </Button>
                <Button onClick={onConfirm} disabled={pending || effectiveSelectedIds.size === 0}>
                  {effectiveSelectedIds.size}명 선발 확정
                </Button>
              </div>
            </div>
          )}
          {stage === 'done' && (
            <Button
              className='ml-auto'
              onClick={() => {
                setOpen(false);
                router.refresh();
              }}
            >
              완료
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function WeightPanel({
  weights,
  onChange,
  quotaRatio,
  onQuotaChange,
  totalCapacity,
  onTotalChange,
  withReserve,
  onWithReserveChange,
  effectiveCapacity,
  maxPerOrg,
  onMaxPerOrgChange,
  excludeNoPrereq,
  onExcludeNoPrereqChange,
  poolSize,
  selectedCount
}: {
  weights: ScoreWeights;
  onChange: (key: keyof ScoreWeights, value: number) => void;
  quotaRatio: QuotaRatio;
  onQuotaChange: (key: keyof QuotaRatio, value: number) => void;
  totalCapacity: number;
  onTotalChange: (v: number) => void;
  withReserve: boolean;
  onWithReserveChange: (v: boolean) => void;
  effectiveCapacity: number;
  maxPerOrg: number;
  onMaxPerOrgChange: (v: number) => void;
  excludeNoPrereq: boolean;
  onExcludeNoPrereqChange: (v: boolean) => void;
  poolSize: number;
  selectedCount: number;
}) {
  const wSum = weights.knowledge + weights.plan;
  const rSum = quotaRatio.central + quotaRatio.local + quotaRatio.public_edu;
  return (
    <div className='flex flex-col gap-3 rounded-md border bg-muted/30 p-3'>
      <div className='flex items-center gap-3'>
        <label htmlFor='total-capacity' className='text-sm font-medium'>
          총 정원
        </label>
        <Input
          id='total-capacity'
          type='number'
          value={totalCapacity}
          onChange={(e) => onTotalChange(Number(e.target.value) || 0)}
          className='h-8 w-20 tabular-nums'
        />
        <label
          htmlFor='with-reserve'
          className='flex cursor-pointer items-center gap-1.5 text-xs'
          title='정원의 110%를 선발 (예비합격자 포함)'
        >
          <Checkbox
            id='with-reserve'
            checked={withReserve}
            onCheckedChange={(v) => onWithReserveChange(v === true)}
          />
          <span>110% 선발</span>
          {withReserve && effectiveCapacity !== totalCapacity && (
            <span className='text-muted-foreground tabular-nums'>({effectiveCapacity}명)</span>
          )}
        </label>
        <label htmlFor='max-per-org' className='text-sm font-medium ml-3'>
          기관당 최대
        </label>
        <Input
          id='max-per-org'
          type='number'
          value={maxPerOrg}
          min={0}
          onChange={(e) => onMaxPerOrgChange(Number(e.target.value) || 0)}
          className='h-8 w-16 tabular-nums'
          title='0 = 무제한'
        />
        <span className='text-muted-foreground text-xs'>지원자 {poolSize}명</span>
        <span className='ml-auto text-sm'>
          현재 선택 <span className='font-semibold tabular-nums'>{selectedCount}</span>명
        </span>
      </div>

      <div className='flex flex-col gap-1.5'>
        <div className='text-muted-foreground text-xs font-medium'>점수 가중치</div>
        <div className='grid grid-cols-2 gap-2'>
          <WeightInput
            id='w-knowledge'
            label='시험 점수 (지식)'
            value={weights.knowledge}
            onChange={(v) => onChange('knowledge', v)}
          />
          <WeightInput
            id='w-plan'
            label='정성평가 (체크, 글자수)'
            value={weights.plan}
            onChange={(v) => onChange('plan', v)}
          />
        </div>
        <div className='text-muted-foreground text-xs'>
          합계 {wSum} · 합이 100이 아니어도 자동 정규화됩니다.
        </div>
      </div>

      <div className='flex flex-col gap-1.5'>
        <div className='text-muted-foreground text-xs font-medium'>부처 정원 비율</div>
        <div className='grid grid-cols-3 gap-2'>
          <WeightInput
            id='r-central'
            label='중앙부처'
            value={quotaRatio.central}
            onChange={(v) => onQuotaChange('central', v)}
          />
          <WeightInput
            id='r-local'
            label='지자체 (광역+기초)'
            value={quotaRatio.local}
            onChange={(v) => onQuotaChange('local', v)}
          />
          <WeightInput
            id='r-public'
            label='공공·교육'
            value={quotaRatio.public_edu}
            onChange={(v) => onQuotaChange('public_edu', v)}
          />
        </div>
        <div className='text-muted-foreground text-xs'>
          합계 {rSum} · 비율 기준으로 쿼터 분배 (기본 5:3:2)
        </div>
      </div>

      <div className='flex items-center justify-end gap-2 text-sm'>
        <Checkbox
          id='exclude-no-prereq'
          checked={excludeNoPrereq}
          onCheckedChange={(v) => onExcludeNoPrereqChange(v === true)}
        />
        <label htmlFor='exclude-no-prereq' className='cursor-pointer'>
          사전학습 미수료자 강제 제외 (부분 수료 포함)
        </label>
      </div>
    </div>
  );
}

function WeightInput({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: number;
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
        max={100}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className='h-8 w-full tabular-nums'
      />
    </div>
  );
}

// 분포 박스에 표시할 카테고리 — 'other'(기타)는 흘러내림에만 쓰고 UI에서 숨김
const DISPLAY_CATEGORIES: SelectionCategory[] = ['central', 'local', 'public_edu'];

function DistributionRow({
  distribution,
  poolByCategory,
  quotas,
  totalCapacity,
  activeCategory,
  onCategoryClick
}: {
  distribution: Record<SelectionCategory, number>;
  poolByCategory: Record<SelectionCategory, number>;
  quotas: Record<SelectionCategory, number>;
  totalCapacity: number;
  activeCategory: SelectionCategory | null;
  onCategoryClick: (cat: SelectionCategory) => void;
}) {
  const sum = SELECTION_CATEGORY_ORDER.reduce((s, k) => s + (distribution[k] ?? 0), 0);
  return (
    <div className='flex flex-col gap-2 rounded-md border p-3'>
      <div className='flex items-center justify-between'>
        <div className='text-xs font-medium'>분류별 선발 분포 (합격/지원 · 배정)</div>
        {activeCategory && (
          <button
            type='button'
            onClick={() => onCategoryClick(activeCategory)}
            className='text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline'
          >
            필터 해제
          </button>
        )}
      </div>
      <div className='grid grid-cols-3 gap-2 text-xs'>
        {DISPLAY_CATEGORIES.map((cat) => {
          const count = distribution[cat] ?? 0;
          const pool = poolByCategory[cat] ?? 0;
          const quota = quotas[cat] ?? 0;
          const pct = sum > 0 ? Math.round((count / sum) * 100) : 0;
          const isActive = activeCategory === cat;
          return (
            <button
              type='button'
              key={cat}
              onClick={() => onCategoryClick(cat)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded border px-2 py-2 transition-colors',
                'hover:bg-muted/60',
                isActive && 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-300'
              )}
            >
              <span className='text-muted-foreground'>{SELECTION_CATEGORY_LABEL[cat]}</span>
              <span className='text-base font-semibold tabular-nums'>
                {count}
                <span className='text-muted-foreground text-xs font-normal'>/{pool}</span>
                <span className='ml-1 text-emerald-700 text-xs font-medium'>{pct}%</span>
              </span>
              <span className='text-muted-foreground tabular-nums'>
                배정 {quota > 0 ? `${quota}명` : '—'}
              </span>
            </button>
          );
        })}
      </div>
      {sum !== totalCapacity && (
        <div className='text-amber-600 text-xs'>
          선택 합계 {sum} · 정원 {totalCapacity} (수동 조정 또는 풀 부족으로 차이 발생)
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  applied: '신청',
  pending: '검토중',
  selected: '선발',
  rejected: '탈락',
  withdrawn: '취하'
};

function CandidateList({
  scored,
  autoSelectedIds,
  effectiveSelectedIds,
  onToggle,
  totalCapacity,
  filterCategory
}: {
  scored: ScoredCandidate[];
  autoSelectedIds: Set<string>;
  effectiveSelectedIds: Set<string>;
  onToggle: (id: string) => void;
  totalCapacity: number;
  filterCategory: SelectionCategory | null;
}) {
  const visible = filterCategory
    ? scored
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.category === filterCategory)
    : scored.map((c, i) => ({ c, i }));
  return (
    <div className='flex flex-col rounded-md border'>
      <div className='bg-muted/40 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium'>
        <span className='w-6'>#</span>
        <span className='w-6' />
        <span className='w-20'>이름</span>
        <span className='w-12 text-center'>타과정</span>
        <span className='w-20'>분류</span>
        <span className='flex-1'>소속</span>
        <span className='w-10 text-center'>사전</span>
        <span className='w-12 text-right'>지식</span>
        <span className='w-12 text-right'>체크</span>
        <span className='w-12 text-right'>글자</span>
        <span className='w-14 text-right'>종합</span>
      </div>
      <div className='max-h-[40vh] divide-y overflow-y-auto'>
        {visible.map(({ c, i }) => {
          const checked = effectiveSelectedIds.has(c.application_id);
          const wasAuto = autoSelectedIds.has(c.application_id);
          const isManual = checked !== wasAuto;
          const inCapacity = i < totalCapacity;
          return (
            <label
              key={c.application_id}
              className={cn(
                'hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
                checked && 'bg-emerald-50/60',
                isManual && 'border-l-2 border-amber-400'
              )}
            >
              <span className='text-muted-foreground w-6 text-xs tabular-nums'>{i + 1}</span>
              <Checkbox checked={checked} onCheckedChange={() => onToggle(c.application_id)} />
              <span className='w-20 truncate font-medium'>{c.name}</span>
              <span className='w-12 text-center text-xs'>
                {c.other_applications.length > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type='button'
                        onClick={(e) => e.preventDefault()}
                        className='inline-flex cursor-default items-center justify-center rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700'
                      >
                        +{c.other_applications.length}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side='top' className='max-w-xs'>
                      <div className='flex flex-col gap-0.5 text-xs'>
                        <div className='mb-0.5 font-semibold opacity-90'>다른 기수 지원</div>
                        {c.other_applications.map((o) => (
                          <div key={o.cohort_id}>
                            {o.cohort_name}
                            <span className='ml-1 opacity-70'>· {STATUS_LABEL[o.status] ?? o.status}</span>
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </span>
              <span className='text-muted-foreground w-20 truncate text-xs'>
                {SELECTION_CATEGORY_LABEL[c.category]}
              </span>
              {c.organization ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className='text-muted-foreground flex-1 truncate text-xs'>
                      {c.organization}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side='top' className='max-w-md break-all'>
                    {c.organization}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className='text-muted-foreground flex-1 truncate text-xs'>—</span>
              )}
              <span
                className={cn(
                  'w-10 text-center text-xs font-medium tabular-nums',
                  c.prereq_max === 0
                    ? 'text-muted-foreground'
                    : c.prereq_done_count === c.prereq_max
                      ? 'text-emerald-600'
                      : c.prereq_done_count > 0
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                )}
                title={
                  c.prereq_max === 0
                    ? 'cohort에 사전학습 요구 없음'
                    : `사전학습 ${c.prereq_done_count}/${c.prereq_max} 수료`
                }
              >
                {c.prereq_max === 0 ? '—' : `${c.prereq_done_count}/${c.prereq_max}`}
              </span>
              <span className='w-12 text-right tabular-nums text-xs'>{c.knowledge_score}</span>
              <span className='w-12 text-right tabular-nums text-xs'>
                {c.multi_selected_count}
                {c.multi_choices_max > 0 && (
                  <span className='text-muted-foreground'>/{c.multi_choices_max}</span>
                )}
              </span>
              <span className='w-12 text-right tabular-nums text-xs'>{c.plan_char_count}</span>
              <span
                className={cn(
                  'w-14 text-right font-medium tabular-nums',
                  inCapacity ? 'text-emerald-700' : 'text-muted-foreground'
                )}
              >
                {c.final_score.toFixed(1)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
