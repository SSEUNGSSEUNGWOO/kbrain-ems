'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  type Decision,
  type ScoredCandidate,
  type SelectionCategory,
  DECISION_LABEL,
  SELECTION_CATEGORY_LABEL,
  SELECTION_CATEGORY_ORDER
} from '../_selection-logic';
import { PriorCertsChips } from './prior-certs-chips';

type Props = {
  scored: ScoredCandidate[];
  decisions: Map<string, Decision>;
  autoSelectedIds: Set<string>;
  effectiveSelectedIds: Set<string>;
  onToggle: (id: string) => void;
  totalCapacity: number; // effectiveCapacity
  filterCategory: SelectionCategory | null;
  onCategoryClick: (cat: SelectionCategory) => void;
  distribution: Record<SelectionCategory, number>;
  poolByCategory: Record<SelectionCategory, number>;
  quotas: Record<SelectionCategory, number>;
  avgScore: number | null; // 평균 하한선 (null = 미적용)
};

/** Step 3 — 결과 검토: 분포 + 후보 리스트(사유 배지) + 수동 토글 */
export function SelectionResultStep(p: Props) {
  const belowAvgCount = [...p.decisions.values()].filter(
    (d) => d.kind === 'rejected' && d.why === 'below_avg'
  ).length;
  return (
    <div className='flex flex-col gap-4'>
      {p.avgScore !== null && (
        <div className='rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800'>
          종합점수 평균 하한선 <b className='tabular-nums'>{p.avgScore.toFixed(1)}점</b> 적용 중 —
          평균 미만 <b className='tabular-nums'>{belowAvgCount}명</b>은 기관 분산에서 후순위 처리
          (정원이 남을 때만 점수순 충원)
        </div>
      )}
      <DistributionRow
        distribution={p.distribution}
        poolByCategory={p.poolByCategory}
        quotas={p.quotas}
        totalCapacity={p.totalCapacity}
        activeCategory={p.filterCategory}
        onCategoryClick={p.onCategoryClick}
      />
      <CandidateList
        scored={p.scored}
        decisions={p.decisions}
        autoSelectedIds={p.autoSelectedIds}
        effectiveSelectedIds={p.effectiveSelectedIds}
        onToggle={p.onToggle}
        totalCapacity={p.totalCapacity}
        filterCategory={p.filterCategory}
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
                <span className='ml-1 text-xs font-medium text-emerald-700'>{pct}%</span>
              </span>
              <span className='text-muted-foreground tabular-nums'>
                배정 {quota > 0 ? `${quota}명` : '—'}
              </span>
            </button>
          );
        })}
      </div>
      {sum !== totalCapacity && (
        <div className='text-xs text-amber-600'>
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

function DecisionBadge({
  decision,
  isManual,
  checked
}: {
  decision: Decision | undefined;
  isManual: boolean;
  checked: boolean;
}) {
  if (isManual) {
    return (
      <span className='inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800'>
        {checked ? '수동 선발' : '수동 제외'}
      </span>
    );
  }
  if (!decision) return <span className='text-muted-foreground'>—</span>;
  if (decision.kind === 'selected') {
    return (
      <span className='inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700'>
        {DECISION_LABEL[decision.via]}
      </span>
    );
  }
  const label =
    decision.why === 'score_cut' && decision.cutoff != null
      ? `점수 미달 (컷 ${decision.cutoff.toFixed(1)})`
      : decision.why === 'below_avg' && decision.cutoff != null
        ? `평균 미달 (평균 ${decision.cutoff.toFixed(1)})`
        : DECISION_LABEL[decision.why];
  return (
    <span className='inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600'>
      {label}
    </span>
  );
}

function CandidateList({
  scored,
  decisions,
  autoSelectedIds,
  effectiveSelectedIds,
  onToggle,
  totalCapacity,
  filterCategory
}: {
  scored: ScoredCandidate[];
  decisions: Map<string, Decision>;
  autoSelectedIds: Set<string>;
  effectiveSelectedIds: Set<string>;
  onToggle: (id: string) => void;
  totalCapacity: number;
  filterCategory: SelectionCategory | null;
}) {
  const visible = filterCategory
    ? scored.map((c, i) => ({ c, i })).filter(({ c }) => c.category === filterCategory)
    : scored.map((c, i) => ({ c, i }));
  return (
    <div className='flex flex-col rounded-md border'>
      <div className='bg-muted/40 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium'>
        <span className='w-6'>#</span>
        <span className='w-6' />
        <span className='w-20'>이름</span>
        <span className='w-24 text-center'>사유</span>
        <span className='w-12 text-center'>타과정</span>
        <span className='w-20 text-center'>인증</span>
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
              <span className='flex w-20 items-center gap-1 truncate font-medium'>
                <span className='truncate'>{c.name}</span>
                {c.force_select && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className='inline-flex items-center rounded bg-rose-100 px-1 py-0.5 text-[10px] font-semibold text-rose-700'>
                        강제
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side='top'>
                      강제선발 대상 ({c.force_reason ?? '지정'})
                      <br />
                      사전학습·자격증·정원 조건 무시
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
              <span className='w-24 text-center text-xs'>
                <DecisionBadge
                  decision={decisions.get(c.application_id)}
                  isManual={isManual}
                  checked={checked}
                />
              </span>
              <span className='w-12 text-center text-xs'>
                {c.other_applications.length > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type='button'
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
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
                            <span className='ml-1 opacity-70'>
                              · {STATUS_LABEL[o.status] ?? o.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </span>
              <span className='w-20 text-center text-xs'>
                <PriorCertsChips certs={c.prior_certs} />
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
              <span className='w-12 text-right text-xs tabular-nums'>{c.knowledge_score}</span>
              <span className='w-12 text-right text-xs tabular-nums'>
                {c.multi_selected_count}
                {c.multi_choices_max > 0 && (
                  <span className='text-muted-foreground'>/{c.multi_choices_max}</span>
                )}
              </span>
              <span className='w-12 text-right text-xs tabular-nums'>{c.plan_char_count}</span>
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
