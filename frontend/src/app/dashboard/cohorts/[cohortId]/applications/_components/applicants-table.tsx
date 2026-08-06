'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { cn } from '@/lib/utils';
import { updateApplicationStatus } from '../_actions';
import {
  ApplicantSheet,
  type Applicant as ApplicantEdit
} from '@/app/dashboard/applicants/_components/applicant-sheet';

export type ApplicationRow = {
  id: string;
  applicant_id: string;
  name: string;
  organization: string | null;
  c2_choice: string | null;
  applicant_category: string | null;
  status: string;
  rejected_stage: string | null;
  knowledge_score: number | null;
  knowledge_correct_count: number | null;
  knowledge_total_count: number | null;
  plan_char_count: number | null;
  prereq_done_count: number;
  /** 자격연계형 cohort 한정: 자격증 답변 원문 텍스트.
   *  null = 자격연계형이 아니거나 답변 자체가 없음.
   */
  cert_text: string | null;
  /** 자격증 자동 분류 (none/planned/has). 운영자 빠른 스캔용 보조 라벨.
   *  자유 서술이라 1~2건 오분류 가능 — 애매하면 cert_text 원문으로 확인.
   *  null = 자격연계형이 아니거나 답변 없음.
   */
  cert_bucket: 'none' | 'planned' | 'has' | null;
  /** 자기주도형 cohort 한정: 이전 챔피언 과정(회차·특화) 이력. null = 이력 없음 또는 비대상 cohort. */
  special_history: {
    cohortName: string;
    shortName: string;
    status: 'completed' | 'not_certified' | 'exam_only_left' | 'insufficient';
    attendedDays: number;
    requiredDays: number;
  } | null;
  applied_at: string | null;
  applicant_edit: ApplicantEdit | null;
  can_edit: boolean;
};

// 과정 이력 뱃지 — exam_only_left 가 선발 시 핵심 관리 대상 (시험만 보면 원 과정 수료)
const SPECIAL_HISTORY_BADGE: Record<
  NonNullable<ApplicationRow['special_history']>['status'],
  { label: string; tone: string }
> = {
  completed: { label: '수료', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  not_certified: { label: '미인증', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  exam_only_left: {
    label: '미수료 · 시험만 남음',
    tone: 'bg-amber-50 text-amber-800 border-amber-300'
  },
  insufficient: {
    label: '미수료 · 집중 미달',
    tone: 'bg-rose-50 text-rose-700 border-rose-200'
  }
};

// 설문항목 2 (C2) 응답 → 분류 라벨·톤
const C2_CATEGORY: Record<string, { label: string; tone: string }> = {
  '①': { label: '중앙부처', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  '②': { label: '광역지자체', tone: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  '③': { label: '기초지자체', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  '④': { label: '공공기관', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  '⑤': { label: '교육행정기관', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  '⑥': { label: '기타', tone: 'bg-slate-50 text-slate-600 border-slate-200' }
};

// C2 6지선다에는 없지만 지원자 마스터에 존재하는 분류 (fallback 표시용)
const EXTRA_CATEGORY: Record<string, { label: string; tone: string }> = {
  지방공공기관: {
    label: '지방공공기관',
    tone: 'bg-orange-50 text-orange-700 border-orange-200'
  }
};

const STATUS_LABEL: Record<string, string> = {
  applied: '신청',
  selected: '선발',
  rejected: '탈락',
  pre_cancel: '사전취소',
  same_day_cancel: '당일취소'
};

const STATUS_TONE: Record<string, string> = {
  applied: 'bg-slate-100 text-slate-700 border-slate-300',
  selected: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  pre_cancel: 'bg-orange-50 text-orange-800 border-orange-200',
  same_day_cancel: 'bg-rose-50 text-rose-700 border-rose-200'
};

type Props = {
  rows: ApplicationRow[];
  cohortId: string;
  page: number;
  pageSize: number;
  pageCount: number;
  totalCount: number;
  categoryCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  prereqMax: number; // 0이면 사전학습 컬럼 숨김
  hasCertQuestion: boolean; // 자격연계형 cohort 일 때만 true → 자격증 컬럼 노출
  showSpecialHistory?: boolean; // 자기주도형 cohort 일 때만 true → 특화 이력 컬럼 노출
};

const CATEGORY_KEYS = [
  'central',
  'metro_local',
  'basic_local',
  'public',
  'local_public',
  'education',
  'other'
] as const;
const STATUS_KEYS = ['applied', 'selected', 'rejected', 'pre_cancel', 'same_day_cancel'] as const;
const SORTABLE_COLS = ['status', 'name', 'knowledge_score', 'applied_at'] as const;
type SortableCol = (typeof SORTABLE_COLS)[number];

export function ApplicantsTable({
  rows,
  cohortId,
  page,
  pageSize,
  pageCount,
  totalCount,
  categoryCounts,
  statusCounts,
  prereqMax,
  hasCertQuestion,
  showSpecialHistory = false
}: Props) {
  const [{ q, category, status, sort }, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      category: parseAsString.withDefault(''),
      status: parseAsString.withDefault(''),
      sort: parseAsString.withDefault('applied_at:desc'),
      page: parseAsInteger.withDefault(1)
    },
    { shallow: false }
  );

  const [sortColRaw = 'applied_at', sortDirRaw = 'desc'] = sort.split(':');
  const sortCol = (SORTABLE_COLS as readonly string[]).includes(sortColRaw)
    ? (sortColRaw as SortableCol)
    : null;
  const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc';

  const onSort = (col: SortableCol) => {
    const next =
      sortCol === col
        ? `${col}:${sortDir === 'asc' ? 'desc' : 'asc'}`
        : `${col}:${col === 'knowledge_score' ? 'desc' : 'asc'}`;
    void setParams({ sort: next, page: null });
  };

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

  const setCategory = (next: string | null) => {
    void setParams({ category: next, page: null });
  };
  const setStatus = (next: string | null) => {
    void setParams({ status: next, page: null });
  };

  const isEmpty = rows.length === 0;
  const firstIndex = isEmpty ? 0 : (page - 1) * pageSize + 1;
  const lastIndex = isEmpty ? 0 : (page - 1) * pageSize + rows.length;
  const hasFilter = Boolean(q || category || status);

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative w-full sm:w-72'>
          <Icons.search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            value={inputValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder='이름 또는 연락처 검색'
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

      <ChipFilter
        label='분류'
        current={category || null}
        onChange={setCategory}
        items={CATEGORY_KEYS.map((k) => ({
          key: k,
          label: CATEGORY_LABEL[k],
          tone: CATEGORY_TONE_BY_KEY[k],
          count: categoryCounts[k] ?? 0
        }))}
      />
      <ChipFilter
        label='상태'
        current={status || null}
        onChange={setStatus}
        items={STATUS_KEYS.map((k) => ({
          key: k,
          label: STATUS_LABEL[k] ?? k,
          tone: STATUS_TONE[k] ?? STATUS_TONE.applied,
          count: statusCounts[k] ?? 0
        }))}
      />

      {isEmpty ? (
        <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
          <div className='bg-muted text-muted-foreground mb-4 flex h-14 w-14 items-center justify-center rounded-full'>
            <Icons.search className='h-6 w-6' />
          </div>
          <p className='text-foreground mb-1 font-medium'>
            {hasFilter ? '결과가 없습니다' : '신청자가 없습니다'}
          </p>
          {hasFilter && (
            <p className='text-muted-foreground text-sm'>검색어나 필터를 조정해보세요.</p>
          )}
        </div>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead col='status' current={sortCol} dir={sortDir} onSort={onSort}>
                  상태
                </SortableHead>
                <SortableHead col='name' current={sortCol} dir={sortDir} onSort={onSort}>
                  이름
                </SortableHead>
                <TableHead>분류</TableHead>
                <TableHead>소속</TableHead>
                {hasCertQuestion && <TableHead>자격증</TableHead>}
                {showSpecialHistory && <TableHead>과정 이력</TableHead>}
                {prereqMax > 0 && <TableHead className='text-right'>사전학습</TableHead>}
                <SortableHead
                  col='knowledge_score'
                  current={sortCol}
                  dir={sortDir}
                  onSort={onSort}
                  align='right'
                >
                  역량점수
                </SortableHead>
                <TableHead className='text-right'>활용 계획</TableHead>
                <SortableHead col='applied_at' current={sortCol} dir={sortDir} onSort={onSort}>
                  신청일
                </SortableHead>
                <TableHead className='w-12'></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                // c2 응답 우선. 신청서에 C2 문항이 없는 cohort(전문인재 등)는 운영자가
                // applicants.category 한글 라벨에 직접 입력한 값을 fallback 으로 사용.
                const c2 = r.c2_choice ? C2_CATEGORY[r.c2_choice] : null;
                const fallback = r.applicant_category
                  ? (Object.values(C2_CATEGORY).find((v) => v.label === r.applicant_category) ??
                    EXTRA_CATEGORY[r.applicant_category])
                  : null;
                const catLabel = c2?.label ?? fallback?.label ?? '미분류';
                const catTone =
                  c2?.tone ?? fallback?.tone ?? 'border-border bg-muted text-muted-foreground';
                return (
                  <TableRow key={r.id} className='group hover:bg-muted/50'>
                    <TableCell>
                      <StatusSelect applicationId={r.id} cohortId={cohortId} status={r.status} />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/cohorts/${cohortId}/applications/${r.id}`}
                        className='font-medium hover:underline'
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline' className={cn('font-normal', catTone)}>
                        {catLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>{r.organization ?? '—'}</TableCell>
                    {hasCertQuestion && (
                      <TableCell className='max-w-[220px]'>
                        {r.cert_bucket ? (
                          <div className='flex flex-col gap-1'>
                            <Badge
                              variant='outline'
                              className={cn(
                                'w-fit font-normal',
                                r.cert_bucket === 'has' &&
                                  'bg-emerald-50 text-emerald-700 border-emerald-200',
                                r.cert_bucket === 'planned' &&
                                  'bg-amber-50 text-amber-800 border-amber-200',
                                r.cert_bucket === 'none' &&
                                  'bg-rose-50 text-rose-700 border-rose-200'
                              )}
                            >
                              {r.cert_bucket === 'has'
                                ? '보유'
                                : r.cert_bucket === 'planned'
                                  ? '예정'
                                  : '없음'}
                            </Badge>
                            {r.cert_text && (
                              <span
                                className='block truncate text-xs text-slate-600'
                                title={r.cert_text}
                              >
                                {r.cert_text}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className='text-muted-foreground text-xs'>—</span>
                        )}
                      </TableCell>
                    )}
                    {showSpecialHistory && (
                      <TableCell>
                        {r.special_history ? (
                          <Badge
                            variant='outline'
                            className={cn(
                              'font-normal whitespace-nowrap',
                              SPECIAL_HISTORY_BADGE[r.special_history.status].tone
                            )}
                            title={`${r.special_history.cohortName} · 집중 ${r.special_history.attendedDays}/${r.special_history.requiredDays}일`}
                          >
                            {r.special_history.shortName}{' '}
                            {SPECIAL_HISTORY_BADGE[r.special_history.status].label}
                          </Badge>
                        ) : (
                          <span className='text-muted-foreground text-xs'>—</span>
                        )}
                      </TableCell>
                    )}
                    {prereqMax > 0 && (
                      <TableCell
                        className={cn(
                          'text-right tabular-nums text-sm font-medium',
                          r.prereq_done_count >= prereqMax
                            ? 'text-emerald-600'
                            : r.prereq_done_count > 0
                              ? 'text-amber-600'
                              : 'text-muted-foreground'
                        )}
                      >
                        {r.prereq_done_count}/{prereqMax}
                      </TableCell>
                    )}
                    <TableCell className='text-right tabular-nums'>
                      <KnowledgeCell row={r} />
                    </TableCell>
                    <TableCell className='text-right tabular-nums text-sm'>
                      {r.plan_char_count !== null ? `${r.plan_char_count}자` : '—'}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {r.applied_at ?? '—'}
                    </TableCell>
                    <TableCell className='text-right'>
                      {r.can_edit && r.applicant_edit ? (
                        <ApplicantSheet
                          applicant={r.applicant_edit}
                          trigger={
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100'
                              aria-label='지원자 정보 수정'
                            >
                              <Icons.edit className='h-3.5 w-3.5' />
                            </Button>
                          }
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!isEmpty && (
        <div className='grid grid-cols-3 items-center gap-2'>
          <div className='text-muted-foreground text-xs tabular-nums'>
            {firstIndex.toLocaleString()}–{lastIndex.toLocaleString()} /{' '}
            {totalCount.toLocaleString()}건
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

function KnowledgeCell({ row }: { row: ApplicationRow }) {
  if (row.knowledge_score === null) return <span className='text-muted-foreground'>—</span>;
  const correct = row.knowledge_correct_count;
  const total = row.knowledge_total_count;
  return (
    <span>
      <span className='font-medium'>{row.knowledge_score}점</span>
      {correct !== null && total !== null && (
        <span className='text-muted-foreground ml-1 text-xs'>
          ({correct}/{total})
        </span>
      )}
    </span>
  );
}

const CATEGORY_LABEL: Record<(typeof CATEGORY_KEYS)[number], string> = {
  central: '중앙부처',
  metro_local: '광역지자체',
  basic_local: '기초지자체',
  public: '공공기관',
  local_public: '지방공공기관',
  education: '교육행정기관',
  other: '기타'
};
const CATEGORY_TONE_BY_KEY: Record<(typeof CATEGORY_KEYS)[number], string> = {
  central: 'bg-blue-50 text-blue-700 border-blue-200',
  metro_local: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  basic_local: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  public: 'bg-amber-50 text-amber-700 border-amber-200',
  local_public: 'bg-orange-50 text-orange-700 border-orange-200',
  education: 'bg-violet-50 text-violet-700 border-violet-200',
  other: 'bg-slate-50 text-slate-600 border-slate-200'
};

function SortableHead({
  col,
  current,
  dir,
  onSort,
  align,
  children
}: {
  col: SortableCol;
  current: SortableCol | null;
  dir: 'asc' | 'desc';
  onSort: (c: SortableCol) => void;
  align?: 'right';
  children: React.ReactNode;
}) {
  const active = current === col;
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button
        type='button'
        onClick={() => onSort(col)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          align === 'right' && 'justify-end',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {children}
        {active ? (
          dir === 'asc' ? (
            <Icons.chevronUp className='size-3.5' />
          ) : (
            <Icons.chevronDown className='size-3.5' />
          )
        ) : (
          <Icons.chevronsUpDown className='size-3.5 opacity-30' />
        )}
      </button>
    </TableHead>
  );
}

function ChipFilter({
  label,
  current,
  onChange,
  items
}: {
  label: string;
  current: string | null;
  onChange: (next: string | null) => void;
  items: { key: string; label: string; tone: string; count: number }[];
}) {
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <span className='text-muted-foreground mr-1 text-xs font-medium'>{label}</span>
      <button
        type='button'
        onClick={() => onChange(null)}
        className={cn(
          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
          current === null
            ? 'border-foreground bg-foreground text-background'
            : 'border-input hover:bg-muted'
        )}
      >
        전체
      </button>
      {items.map((it) => {
        const active = current === it.key;
        const zero = it.count === 0;
        return (
          <button
            type='button'
            key={it.key}
            onClick={() => onChange(active ? null : it.key)}
            disabled={zero && !active}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              it.tone,
              active
                ? 'ring-2 ring-offset-1'
                : zero
                  ? 'opacity-30 cursor-not-allowed'
                  : 'opacity-70 hover:opacity-100'
            )}
          >
            {it.label} <span className='tabular-nums opacity-70'>{it.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatusSelect({
  applicationId,
  cohortId,
  status
}: {
  applicationId: string;
  cohortId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(status);
  const tone = STATUS_TONE[optimistic] ?? STATUS_TONE.applied;

  const onChange = (next: string) => {
    if (next === optimistic) return;
    setOptimistic(next);
    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, next, cohortId);
      if (result.error) {
        setOptimistic(status);
        // 간단한 피드백 — toast가 없으면 console로
        // eslint-disable-next-line no-console
        console.error('상태 변경 실패:', result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Select value={optimistic} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        size='sm'
        className={cn('w-24 border font-normal', tone, pending && 'opacity-60')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_KEYS.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
