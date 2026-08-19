'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  type ScoreWeights,
  type SelectionCategory,
  type SelectionConfigSnapshot,
  DEFAULT_QUOTA_RATIO,
  DEFAULT_WEIGHTS,
  cohortTrackFromName,
  computeQuotas,
  distributeByCategory,
  recommendByQuotas,
  runExclusions
} from '../_selection-logic';
import { SelectionFunnelStep } from './selection-funnel-step';
import { SelectionConfigStep } from './selection-config-step';
import { SelectionResultStep } from './selection-result-step';

type Props = {
  cohortId: string;
  defaultCapacity: number;
  trigger: React.ReactNode;
};

type Stage = 'idle' | 'loading' | 'editing' | 'applying' | 'done';
type Step = 1 | 2 | 3;

const STEP_TITLES: Record<Step, string> = {
  1: '제외 확인',
  2: '선발 조건',
  3: '결과 검토'
};

export function SelectionSheet({ cohortId, defaultCapacity, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [preExcluded, setPreExcluded] = useState<{ name: string; reason: string }[]>([]);
  const [cohortName, setCohortName] = useState<string | null>(null);
  const [knowledgeMax, setKnowledgeMax] = useState(10);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [quotaRatio, setQuotaRatio] = useState<QuotaRatio>(DEFAULT_QUOTA_RATIO);
  const [totalCapacity, setTotalCapacity] = useState(defaultCapacity);
  const [withReserve, setWithReserve] = useState(true);
  const [maxPerOrg, setMaxPerOrg] = useState(3);
  const [filterCategory, setFilterCategory] = useState<SelectionCategory | null>(null);
  const [excludedCohortIds, setExcludedCohortIds] = useState<Set<string>>(new Set());
  const [exceptions, setExceptions] = useState<Set<string>>(new Set());
  const [parentOrgCapInput, setParentOrgCapInput] = useState(0);
  const [manualToggles, setManualToggles] = useState<Map<string, boolean>>(new Map());
  const [rejectOthers, setRejectOthers] = useState(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ selectedCount?: number; rejectedCount?: number } | null>(
    null
  );

  // 110% 선발 시 실제 사용되는 정원. 부동소수점(100*1.1=110.000...01) 때문에 round.
  const effectiveCapacity = useMemo(
    () => (withReserve ? Math.round(totalCapacity * 1.1) : totalCapacity),
    [totalCapacity, withReserve]
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
      setPreExcluded(res.preExcluded ?? []);
      setCohortName(res.cohortName ?? null);
      if (res.knowledgeMax && res.knowledgeMax > 0) setKnowledgeMax(res.knowledgeMax);
      setStage('editing');
    })();
  }, [open, stage, cohortId]);

  const initializedTogglesRef = useRef(false);

  // Step 1 깔때기 — 하드 제외 규칙 적용
  const cohortTrack = useMemo(() => cohortTrackFromName(cohortName), [cohortName]);
  const { pool, stages: exclusionStages } = useMemo(
    () => runExclusions(candidates, { cohortTrack, excludedCohortIds, exceptions }),
    [candidates, cohortTrack, excludedCohortIds, exceptions]
  );

  // 다른 cohort 목록 — candidates의 other_applications에서 추출
  const availableExclusionCohorts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of candidates) {
      for (const o of c.other_applications) {
        if (!seen.has(o.cohort_id)) seen.set(o.cohort_id, o.cohort_name);
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .toSorted((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [candidates]);

  // 조건이 변하면 자동 추천 재계산 (수동 토글이 있는 사람은 그 결정을 유지)
  const { scored, autoSelectedIds, decisions } = useMemo(() => {
    if (pool.length === 0) {
      return {
        scored: [] as ReturnType<typeof recommendByQuotas>['scored'],
        autoSelectedIds: new Set<string>(),
        decisions: new Map() as ReturnType<typeof recommendByQuotas>['decisions']
      };
    }
    const res = recommendByQuotas(
      pool,
      weights,
      effectiveCapacity,
      knowledgeMax,
      quotaRatio,
      maxPerOrg,
      parentOrgCapInput
    );
    return {
      scored: res.scored,
      autoSelectedIds: new Set(res.selectedIds),
      decisions: res.decisions
    };
  }, [pool, weights, effectiveCapacity, knowledgeMax, quotaRatio, maxPerOrg, parentOrgCapInput]);

  // 이미 selected/rejected가 있는 cohort라면 시트 열릴 때 한 번만
  // manualToggles를 DB 상태로 채워 알고리즘 추천이 덮어쓰지 않게 함.
  useEffect(() => {
    if (!open) {
      initializedTogglesRef.current = false;
      return;
    }
    if (stage !== 'editing' || candidates.length === 0) return;
    if (initializedTogglesRef.current) return;
    initializedTogglesRef.current = true;

    const hasExisting = candidates.some(
      (c) => c.current_status === 'selected' || c.current_status === 'rejected'
    );
    if (!hasExisting) return;

    const next = new Map<string, boolean>();
    for (const c of candidates) {
      const inDb = c.current_status === 'selected';
      const inAuto = autoSelectedIds.has(c.application_id);
      if (inDb !== inAuto) next.set(c.application_id, inDb);
    }
    if (next.size > 0) setManualToggles(next);
  }, [open, stage, candidates, autoSelectedIds]);

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
    for (const c of pool) result[c.category]++;
    return result;
  }, [pool]);

  const reset = () => {
    setStage('idle');
    setStep(1);
    setCandidates([]);
    setPreExcluded([]);
    setCohortName(null);
    setManualToggles(new Map());
    setResult(null);
    setError(null);
    setWeights(DEFAULT_WEIGHTS);
    setQuotaRatio(DEFAULT_QUOTA_RATIO);
    setTotalCapacity(defaultCapacity);
    setWithReserve(true);
    setMaxPerOrg(3);
    setExcludedCohortIds(new Set());
    setExceptions(new Set());
    setParentOrgCapInput(0);
    setFilterCategory(null);
  };

  const resetToggles = () => setManualToggles(new Map());

  const toggle = (id: string) => {
    setManualToggles((prev) => {
      const next = new Map(prev);
      const currentAuto = autoSelectedIds.has(id);
      const currentEffective = effectiveSelectedIds.has(id);
      const desired = !currentEffective;
      if (desired === currentAuto) next.delete(id);
      else next.set(id, desired);
      return next;
    });
  };

  const onConfirm = () => {
    setStage('applying');
    setError(null);
    const exclusionCounts: SelectionConfigSnapshot['exclusionCounts'] = {};
    for (const s of exclusionStages) exclusionCounts[s.key] = s.excluded.length;
    if (preExcluded.length > 0) exclusionCounts.pre_excluded = preExcluded.length;
    const snapshot: SelectionConfigSnapshot = {
      weights,
      quotaRatio,
      maxPerOrg,
      excludeNoPrereq: true, // 하드 규칙화 — 항상 적용됨을 기록
      excludeNoCert: true,
      totalCapacity,
      withReserve,
      effectiveCapacity,
      parentOrgCap: parentOrgCapInput,
      excludedCohortIds: [...excludedCohortIds],
      exclusionCounts,
      exceptions: [...exceptions],
      appliedAt: new Date().toISOString()
    };
    startTransition(async () => {
      const res = await applySelections(
        cohortId,
        [...effectiveSelectedIds],
        rejectOthers,
        snapshot
      );
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
      <SheetContent className='flex w-full max-w-5xl flex-col gap-0 overflow-hidden sm:max-w-5xl'>
        <SheetHeader className='border-b'>
          <SheetTitle>자동 선발</SheetTitle>
          <SheetDescription>제외 확인 → 선발 조건 → 결과 검토 3단계로 진행합니다.</SheetDescription>
          {(stage === 'editing' || stage === 'applying') && (
            <div className='flex items-center gap-1 pt-1'>
              {([1, 2, 3] as Step[]).map((s) => (
                <button
                  key={s}
                  type='button'
                  disabled={stage === 'applying'}
                  onClick={() => setStep(s)}
                  className={cn(
                    'rounded px-2 py-1 text-xs',
                    step === s
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {s}. {STEP_TITLES[s]}
                </button>
              ))}
            </div>
          )}
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
            <div className='p-4'>
              {step === 1 && (
                <SelectionFunnelStep
                  totalApplicants={candidates.length + preExcluded.length}
                  preExcluded={preExcluded}
                  stages={exclusionStages}
                  poolCount={pool.length}
                  cohortTrack={cohortTrack}
                  exceptions={exceptions}
                  onToggleException={(id) => {
                    setExceptions((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                    resetToggles();
                  }}
                  availableExclusionCohorts={availableExclusionCohorts}
                  excludedCohortIds={excludedCohortIds}
                  onToggleExclusionCohort={(id) => {
                    setExcludedCohortIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                    resetToggles();
                  }}
                />
              )}
              {step === 2 && (
                <SelectionConfigStep
                  poolSize={pool.length}
                  totalCapacity={totalCapacity}
                  onTotalChange={(v) => {
                    setTotalCapacity(Math.max(0, v));
                    resetToggles();
                  }}
                  withReserve={withReserve}
                  onWithReserveChange={(v) => {
                    setWithReserve(v);
                    resetToggles();
                  }}
                  effectiveCapacity={effectiveCapacity}
                  weights={weights}
                  onWeightChange={(key, value) => {
                    setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, value)) }));
                    resetToggles();
                  }}
                  quotaRatio={quotaRatio}
                  onQuotaChange={(key, value) => {
                    setQuotaRatio((prev) => ({ ...prev, [key]: Math.max(0, value) }));
                    resetToggles();
                  }}
                  maxPerOrg={maxPerOrg}
                  onMaxPerOrgChange={(v) => {
                    setMaxPerOrg(Math.max(0, v));
                    resetToggles();
                  }}
                  parentOrgCapInput={parentOrgCapInput}
                  onParentOrgCapInputChange={(v) => {
                    setParentOrgCapInput(Math.max(0, v));
                    resetToggles();
                  }}
                />
              )}
              {step === 3 && (
                <SelectionResultStep
                  scored={scored}
                  decisions={decisions}
                  autoSelectedIds={autoSelectedIds}
                  effectiveSelectedIds={effectiveSelectedIds}
                  onToggle={toggle}
                  totalCapacity={effectiveCapacity}
                  filterCategory={filterCategory}
                  onCategoryClick={(cat) =>
                    setFilterCategory((prev) => (prev === cat ? null : cat))
                  }
                  distribution={distribution}
                  poolByCategory={poolByCategory}
                  quotas={quotas}
                />
              )}
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
              {step === 3 ? (
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
              ) : (
                <span className='text-muted-foreground text-xs'>
                  선발 대상 풀 {pool.length}명 · 현재 선택 {effectiveSelectedIds.size}명
                </span>
              )}
              <div className='flex gap-2'>
                {step > 1 && (
                  <Button variant='outline' onClick={() => setStep((s) => (s - 1) as Step)}>
                    이전
                  </Button>
                )}
                {step < 3 ? (
                  <Button onClick={() => setStep((s) => (s + 1) as Step)}>다음</Button>
                ) : (
                  <>
                    <Button variant='outline' onClick={() => setOpen(false)} disabled={pending}>
                      취소
                    </Button>
                    <Button
                      onClick={onConfirm}
                      disabled={pending || effectiveSelectedIds.size === 0}
                    >
                      {effectiveSelectedIds.size}명 선발 확정
                    </Button>
                  </>
                )}
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
