'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { useAuth } from '@/lib/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  classifyOrganization,
  ORGANIZATION_CATEGORY_LABEL,
  type OrganizationCategory
} from '@/lib/organization-category';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Icons } from '@/components/icons';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { deleteApplicant, deleteApplicants } from '../_actions';
import { ApplicantSheet, type Applicant } from './applicant-sheet';

type ApplicantRow = Applicant & {
  applicationCount: number;
  selectedCount: number;
};

export type CategoryCounts = Partial<Record<OrganizationCategory, number>>;

type Props = {
  applicants: ApplicantRow[];
  page: number;
  pageSize: number;
  pageCount: number;
  totalCount: number;
  categoryCounts: CategoryCounts;
  facetTotal: number;
};

const STATUS_BADGE_CLASS =
  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300';

const CATEGORY_CLASS: Record<OrganizationCategory, string> = {
  central:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  basic_local:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  metro_local:
    'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
  public:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  education:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  unknown: 'border-border bg-muted text-muted-foreground'
};

const CATEGORY_ORDER: OrganizationCategory[] = [
  'central',
  'metro_local',
  'basic_local',
  'education',
  'public'
];

export function ApplicantTable({
  applicants,
  page,
  pageSize,
  pageCount,
  totalCount,
  categoryCounts,
  facetTotal
}: Props) {
  const [{ q, category }, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      category: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1)
    },
    { shallow: false }
  );

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

  const onCategoryChange = (next: string | null) => {
    void setParams({ category: next, page: null });
  };

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), Math.max(1, pageCount));
    void setParams({ page: clamped === 1 ? null : clamped });
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ApplicantRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { isDeveloper } = useAuth();

  const visibleIds = applicants.map((a) => a.id);
  const visibleSelectedCount = visibleIds.filter((id) => selected.has(id)).length;
  const isAllSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const isIndeterminate = visibleSelectedCount > 0 && !isAllSelected;

  const toggleAll = () =>
    setSelected((prev) => {
      if (isAllSelected) {
        return new Set([...prev].filter((id) => !visibleIds.includes(id)));
      }
      return new Set([...prev, ...visibleIds]);
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const onDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteApplicant(deleteTarget.id);
      if (result?.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const onBulkDelete = () => {
    setBulkDeleteError(null);
    startTransition(async () => {
      const result = await deleteApplicants([...selected]);
      if (result?.error) {
        setBulkDeleteError(result.error);
        return;
      }
      setSelected(new Set());
      setBulkDeleteOpen(false);
      router.refresh();
    });
  };

  const hasFilter = Boolean(q || category);
  const isEmpty = applicants.length === 0;
  const firstIndex = isEmpty ? 0 : (page - 1) * pageSize + 1;
  const lastIndex = isEmpty ? 0 : (page - 1) * pageSize + applicants.length;

  return (
    <>
      <div className='mb-3 flex flex-wrap items-center gap-2'>
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

      <CategoryFilter
        current={(category || null) as OrganizationCategory | null}
        onChange={onCategoryChange}
        counts={categoryCounts}
        total={facetTotal}
      />

      {isDeveloper && selected.size > 0 && (
        <div className='bg-muted/60 mb-2 flex items-center justify-between rounded-md border px-4 py-2'>
          <span className='text-sm'>{selected.size}명 선택됨</span>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => {
              setBulkDeleteError(null);
              setBulkDeleteOpen(true);
            }}
          >
            선택 삭제
          </Button>
        </div>
      )}

      {isEmpty ? (
        <EmptyState hasFilter={hasFilter} />
      ) : (
        <div className='rounded-md border'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='bg-muted/50 border-b'>
                {isDeveloper && (
                  <th className='w-10 px-4 py-3'>
                    <Checkbox
                      checked={isAllSelected}
                      data-indeterminate={isIndeterminate}
                      onCheckedChange={toggleAll}
                      aria-label='전체 선택'
                      className={isIndeterminate ? 'opacity-60' : ''}
                    />
                  </th>
                )}
                <th className='px-4 py-3 text-left font-medium'>이름</th>
                <th className='px-4 py-3 text-left font-medium'>구분</th>
                <th className='px-4 py-3 text-left font-medium'>소속</th>
                <th className='px-4 py-3 text-left font-medium'>부서</th>
                <th className='px-4 py-3 text-left font-medium'>직책</th>
                <th className='px-4 py-3 text-left font-medium'>연락처</th>
                <th className='whitespace-nowrap px-4 py-3 text-center font-medium'>지원</th>
                <th className='whitespace-nowrap px-4 py-3 text-center font-medium'>합격</th>
                <th className='w-20 px-4 py-3'></th>
              </tr>
            </thead>
            <tbody>
              {applicants.map((a) => {
                const cat = classifyOrganization(a.organizationName);
                return (
                  <tr
                    key={a.id}
                    className={`group border-b transition-colors last:border-0 hover:bg-muted/30 ${
                      selected.has(a.id) ? 'bg-muted/40' : ''
                    }`}
                  >
                    {isDeveloper && (
                      <td className='px-4 py-3'>
                        <Checkbox
                          checked={selected.has(a.id)}
                          onCheckedChange={() => toggleOne(a.id)}
                          aria-label={`${a.name} 선택`}
                        />
                      </td>
                    )}
                    <td className='px-4 py-3 font-medium'>
                      <Link href={`/dashboard/applicants/${a.id}`} className='hover:underline'>
                        {a.name}
                      </Link>
                    </td>
                    <td className='px-4 py-3'>
                      <Badge variant='outline' className={`font-normal ${CATEGORY_CLASS[cat]}`}>
                        {ORGANIZATION_CATEGORY_LABEL[cat]}
                      </Badge>
                    </td>
                    <td className='text-muted-foreground px-4 py-3'>{a.organizationName ?? '-'}</td>
                    <td className='text-muted-foreground px-4 py-3'>{a.department ?? '-'}</td>
                    <td className='text-muted-foreground px-4 py-3'>{a.job_title ?? '-'}</td>
                    <td className='text-muted-foreground px-4 py-3'>{a.phone ?? a.email ?? '-'}</td>
                    <td className='px-4 py-3 text-center'>
                      {a.applicationCount > 0 ? (
                        <span className='font-medium'>{a.applicationCount}</span>
                      ) : (
                        <span className='text-muted-foreground'>-</span>
                      )}
                    </td>
                    <td className='px-4 py-3 text-center'>
                      {a.selectedCount > 0 ? (
                        <Badge variant='outline' className={STATUS_BADGE_CLASS}>
                          {a.selectedCount}
                        </Badge>
                      ) : (
                        <span className='text-muted-foreground'>-</span>
                      )}
                    </td>
                    <td className='px-4 py-3'>
                      <div className='flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                        <ApplicantSheet
                          applicant={a}
                          trigger={
                            <Button variant='ghost' size='icon' className='h-7 w-7'>
                              <Icons.edit className='h-3.5 w-3.5' />
                            </Button>
                          }
                        />
                        {isDeveloper && (
                          <Button
                            variant='ghost'
                            size='icon'
                            className='text-destructive hover:text-destructive h-7 w-7'
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(a);
                            }}
                          >
                            <Icons.trash className='h-3.5 w-3.5' />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isEmpty && (
        <div className='mt-3 grid grid-cols-3 items-center gap-2'>
          <div className='text-muted-foreground text-xs tabular-nums'>
            {firstIndex.toLocaleString()}–{lastIndex.toLocaleString()} /{' '}
            {totalCount.toLocaleString()}명
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 지원자 <strong>{selected.size}명</strong>을 삭제하시겠습니까? 이 작업은 되돌릴
              수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkDeleteError && (
            <div className='text-destructive text-sm px-1'>{bulkDeleteError}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={onBulkDelete}
              disabled={pending}
              className='bg-destructive hover:bg-destructive/90 text-white'
            >
              {pending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지원자 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong>을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수
              없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <div className='text-destructive text-sm px-1'>{deleteError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={pending}
              className='bg-destructive hover:bg-destructive/90 text-white'
            >
              {pending ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  if (hasFilter) {
    return (
      <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
        <div className='bg-muted text-muted-foreground mb-4 flex h-14 w-14 items-center justify-center rounded-full'>
          <Icons.search className='h-6 w-6' />
        </div>
        <p className='text-foreground mb-1 font-medium'>검색 결과가 없습니다</p>
        <p className='text-muted-foreground text-sm'>다른 검색어나 분류를 시도해보세요.</p>
      </div>
    );
  }
  return (
    <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
      <div className='mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40'>
        <Icons.teams className='h-6 w-6 text-blue-500' />
      </div>
      <p className='text-foreground mb-1 font-medium'>등록된 지원자가 없습니다</p>
      <p className='text-muted-foreground text-sm'>우측 상단에서 지원자를 추가해주세요.</p>
    </div>
  );
}

function CategoryFilter({
  current,
  onChange,
  counts,
  total
}: {
  current: OrganizationCategory | null;
  onChange: (cat: string | null) => void;
  counts: CategoryCounts;
  total: number;
}) {
  const showUnknown = (counts.unknown ?? 0) > 0;
  const entries: OrganizationCategory[] = showUnknown
    ? [...CATEGORY_ORDER, 'unknown']
    : CATEGORY_ORDER;

  return (
    <div className='mb-3 flex flex-wrap items-center gap-1.5'>
      <button
        type='button'
        onClick={() => onChange(null)}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          current === null
            ? 'border-foreground bg-foreground text-background'
            : 'border-input hover:bg-muted'
        }`}
      >
        전체 <span className='tabular-nums'>{total}</span>
      </button>
      {entries.map((cat) => {
        const count = counts[cat] ?? 0;
        if (count === 0 && cat !== current) return null;
        const active = current === cat;
        return (
          <button
            type='button'
            key={cat}
            onClick={() => onChange(active ? null : cat)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? `${CATEGORY_CLASS[cat]} ring-2 ring-offset-1`
                : `${CATEGORY_CLASS[cat]} opacity-70 hover:opacity-100`
            }`}
          >
            {ORGANIZATION_CATEGORY_LABEL[cat]}{' '}
            <span className='tabular-nums opacity-70'>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
