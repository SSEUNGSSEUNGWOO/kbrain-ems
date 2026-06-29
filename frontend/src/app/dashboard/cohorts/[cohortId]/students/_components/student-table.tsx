'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  categoryFromLabel,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { deleteStudent, deleteStudents } from '../_actions';
import { updateApplicationStatus } from '../../applications/_actions';
import { StudentSheet } from './student-sheet';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'applied', label: '신청' },
  { value: 'pending', label: '심사중' },
  { value: 'selected', label: '선발' },
  { value: 'rejected', label: '탈락' },
  { value: 'cancel_notice', label: '취소통보' },
  { value: 'cancel_confirmed', label: '취소확정' },
  { value: 'same_day_cancel', label: '당일취소' }
];

const STATUS_TONE: Record<string, string> = {
  applied: 'text-slate-600',
  pending: 'text-amber-700',
  selected: 'text-emerald-700',
  rejected: 'text-rose-700',
  cancel_notice: 'text-amber-700',
  cancel_confirmed: 'text-slate-500',
  same_day_cancel: 'text-rose-700'
};

type Student = {
  id: string;
  name: string;
  organizations: { name: string }[] | { name: string } | null;
  category: string | null;
  applicationId?: string | null;
  applicationStatus?: string | null;
  department: string | null;
  job_title: string | null;
  job_role: string | null;
  birth_date: string | null;
  email?: string | null;
  personal_email?: string | null;
  phone?: string | null;
  notes: string | null;
  attendedSessions: number;
  totalSessions: number;
};

function getOrgName(org: Student['organizations']): string {
  if (!org) return '-';
  if (Array.isArray(org)) return org[0]?.name ?? '-';
  return org.name;
}

/** 신청자가 응답한 분류(applicants.category) 만 사용. 응답 없으면 '미분류'. */
function resolveCategory(student: Student): OrganizationCategory {
  return categoryFromLabel(student.category) ?? 'unknown';
}

const CATEGORY_CLASS: Record<OrganizationCategory, string> = {
  central: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  basic_local: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  metro_local: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
  public: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  education: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  unknown: 'border-border bg-muted text-muted-foreground'
};

function StatusCell({
  cohortId,
  applicationId,
  currentStatus,
  disabled
}: {
  cohortId: string;
  applicationId: string;
  currentStatus: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentStatus);

  const onChange = (next: string) => {
    if (next === value) return;
    setValue(next);
    startTransition(async () => {
      const r = await updateApplicationStatus(applicationId, next, cohortId);
      if (r.error) {
        alert(r.error);
        setValue(currentStatus);
        return;
      }
      router.refresh();
    });
  };

  if (disabled) {
    const label = STATUS_OPTIONS.find((s) => s.value === value)?.label ?? value;
    return (
      <span className={`text-xs font-medium ${STATUS_TONE[value] ?? ''}`}>{label}</span>
    );
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        className={`h-8 w-[7rem] text-xs font-medium ${STATUS_TONE[value] ?? ''}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className='text-xs'>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StudentTable({
  cohortId,
  students,
  hidePersonal = false
}: {
  cohortId: string;
  students: Student[];
  hidePersonal?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<OrganizationCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { isDeveloper } = useAuth();

  const categoryCounts = students.reduce((acc, student) => {
    const category = resolveCategory(student);
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {} as Record<OrganizationCategory, number>);
  const categoryFilters: { value: OrganizationCategory | 'all'; label: string; count: number }[] = [
    { value: 'all', label: '전체', count: students.length },
    { value: 'central', label: ORGANIZATION_CATEGORY_LABEL.central, count: categoryCounts.central ?? 0 },
    { value: 'basic_local', label: ORGANIZATION_CATEGORY_LABEL.basic_local, count: categoryCounts.basic_local ?? 0 },
    { value: 'metro_local', label: ORGANIZATION_CATEGORY_LABEL.metro_local, count: categoryCounts.metro_local ?? 0 },
    { value: 'public', label: ORGANIZATION_CATEGORY_LABEL.public, count: categoryCounts.public ?? 0 },
    { value: 'education', label: ORGANIZATION_CATEGORY_LABEL.education, count: categoryCounts.education ?? 0 },
    ...((categoryCounts.unknown ?? 0) > 0 ? [{ value: 'unknown' as const, label: ORGANIZATION_CATEGORY_LABEL.unknown, count: categoryCounts.unknown ?? 0 }] : [])
  ];
  const orgOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      const name = getOrgName(s.organizations);
      if (name !== '-') set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [students]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredStudents = students.filter((student) => {
    if (categoryFilter !== 'all' && resolveCategory(student) !== categoryFilter) return false;
    if (orgFilter && getOrgName(student.organizations) !== orgFilter) return false;
    if (normalizedQuery) {
      const orgName = getOrgName(student.organizations).toLowerCase();
      const haystack = `${student.name.toLowerCase()} ${orgName} ${(student.department ?? '').toLowerCase()} ${(student.job_title ?? '').toLowerCase()} ${(student.job_role ?? '').toLowerCase()}`;
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });
  const visibleIds = filteredStudents.map((s) => s.id);
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
      const result = await deleteStudent(deleteTarget.id, cohortId);
      if (result?.error) { setDeleteError(result.error); return; }
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const onBulkDelete = () => {
    setBulkDeleteError(null);
    startTransition(async () => {
      const result = await deleteStudents([...selected], cohortId);
      if (result?.error) { setBulkDeleteError(result.error); return; }
      setSelected(new Set());
      setBulkDeleteOpen(false);
      router.refresh();
    });
  };

  if (students.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-16'>
        <div className='mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40'>
          <Icons.teams className='h-6 w-6 text-blue-500' />
        </div>
        <p className='text-foreground mb-1 font-medium'>등록된 인원이 없습니다</p>
        <p className='text-muted-foreground text-sm'>우측 상단에서 인원을 추가해주세요.</p>
      </div>
    );
  }

  return (
    <>
      {/* 선택 툴바 */}
      {isDeveloper && selected.size > 0 && (
        <div className='bg-muted/60 mb-2 flex items-center justify-between rounded-md border px-4 py-2'>
          <span className='text-sm'>{selected.size}명 선택됨</span>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => { setBulkDeleteError(null); setBulkDeleteOpen(true); }}
          >
            선택 삭제
          </Button>
        </div>
      )}

      <div className='mb-3 flex flex-wrap items-center gap-2'>
        <Input
          placeholder='이름·소속·부서·직급으로 검색'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className='h-9 w-full sm:w-72'
        />
        <Popover open={orgPopoverOpen} onOpenChange={setOrgPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              role='combobox'
              aria-expanded={orgPopoverOpen}
              className='h-9 w-full justify-between sm:w-64'
            >
              <span className='truncate'>{orgFilter ?? '전체 부처'}</span>
              <Icons.chevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-72 p-0' align='start'>
            <Command>
              <CommandInput placeholder='부처 검색...' />
              <CommandList>
                <CommandEmpty>검색 결과 없음</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value='__all__'
                    onSelect={() => {
                      setOrgFilter(null);
                      setOrgPopoverOpen(false);
                    }}
                  >
                    전체 부처
                  </CommandItem>
                  {orgOptions.map((name) => (
                    <CommandItem
                      key={name}
                      value={name}
                      onSelect={() => {
                        setOrgFilter(name);
                        setOrgPopoverOpen(false);
                      }}
                    >
                      {name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {(searchQuery || orgFilter) && (
          <Button
            variant='ghost'
            size='sm'
            className='h-9'
            onClick={() => {
              setSearchQuery('');
              setOrgFilter(null);
            }}
          >
            초기화
          </Button>
        )}
        <span className='text-muted-foreground ml-auto text-sm'>
          {filteredStudents.length}명
        </span>
      </div>

      <div className='mb-3 flex flex-wrap gap-1'>
        {categoryFilters.map((filter) => (
          <button
            key={filter.value}
            type='button'
            onClick={() => setCategoryFilter(filter.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              categoryFilter === filter.value
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60'
            }`}
          >
            {filter.label}
            <span className='ml-1.5 text-xs opacity-70'>{filter.count}</span>
          </button>
        ))}
      </div>

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
              <th className='w-28 px-4 py-3 text-left font-medium'>분류</th>
              <th className='px-4 py-3 text-left font-medium'>소속</th>
              {!hidePersonal && <th className='px-4 py-3 text-left font-medium'>전화번호</th>}
              {!hidePersonal && <th className='px-4 py-3 text-left font-medium'>이메일</th>}
              <th className='w-28 px-4 py-3 text-left font-medium'>상태</th>
              <th className='w-28 px-4 py-3 text-left font-medium'>출석률</th>
              <th className='w-20 px-4 py-3'></th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s) => {
              const orgName = getOrgName(s.organizations);
              const category = resolveCategory(s);

              return (
                <tr
                  key={s.id}
                  className={`group border-b transition-colors last:border-0 hover:bg-muted/30 ${selected.has(s.id) ? 'bg-muted/40' : ''}`}
                >
                  {isDeveloper && (
                    <td className='px-4 py-3'>
                      <Checkbox
                        checked={selected.has(s.id)}
                        onCheckedChange={() => toggleOne(s.id)}
                        aria-label={`${s.name} 선택`}
                      />
                    </td>
                  )}
                  <td className='px-4 py-3 font-medium'>{s.name}</td>
                  <td className='px-4 py-3'>
                    <Badge variant='outline' className={`min-w-[6rem] justify-center text-center ${CATEGORY_CLASS[category]}`}>
                      {ORGANIZATION_CATEGORY_LABEL[category]}
                    </Badge>
                  </td>
                  <td className='text-muted-foreground px-4 py-3 truncate'>{orgName}</td>
                  {!hidePersonal && (
                    <td className='text-muted-foreground px-4 py-3'>{s.phone ?? '-'}</td>
                  )}
                  {!hidePersonal && (
                    <td className='text-muted-foreground px-4 py-3'>{s.email ?? '-'}</td>
                  )}
                  <td className='px-4 py-3'>
                    {s.applicationId ? (
                      <StatusCell
                        cohortId={cohortId}
                        applicationId={s.applicationId}
                        currentStatus={s.applicationStatus ?? 'applied'}
                        disabled={!isDeveloper}
                      />
                    ) : (
                      <span className='text-muted-foreground text-xs'>-</span>
                    )}
                  </td>
                  <td className='px-4 py-3'>
                    {s.totalSessions > 0 ? (() => {
                      const pct = Math.round((s.attendedSessions / s.totalSessions) * 100);
                      const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
                      const textColor = pct >= 80 ? 'text-emerald-700 dark:text-emerald-400' : pct >= 50 ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400';
                      return (
                        <div className='flex items-center gap-2'>
                          <div className='bg-muted h-2 w-16 overflow-hidden rounded-full'>
                            <div
                              className={`h-full rounded-full transition-all ${color}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium ${textColor}`}>
                            {pct}%
                          </span>
                        </div>
                      );
                    })() : <span className='text-muted-foreground text-xs'>-</span>}
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                      {isDeveloper && (
                        <StudentSheet
                          cohortId={cohortId}
                          student={{
                            ...s,
                            email: s.email ?? null,
                            personal_email: s.personal_email ?? null,
                            phone: s.phone ?? null
                          }}
                          trigger={
                            <Button variant='ghost' size='icon' className='h-7 w-7'>
                              <Icons.edit className='h-3.5 w-3.5' />
                            </Button>
                          }
                        />
                      )}
                      {isDeveloper && (
                        <Button
                          variant='ghost'
                          size='icon'
                          className='text-destructive hover:text-destructive h-7 w-7'
                          onClick={() => { setDeleteError(null); setDeleteTarget(s); }}
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

      {/* 선택 삭제 확인 */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 인원 <strong>{selected.size}명</strong>을 삭제하시겠습니까?
              {' '}이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkDeleteError && <div className='text-destructive text-sm px-1'>{bulkDeleteError}</div>}
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

      {/* 단건 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>인원 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong>을(를) 삭제하시겠습니까?
              {' '}이 작업은 되돌릴 수 없습니다.
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
