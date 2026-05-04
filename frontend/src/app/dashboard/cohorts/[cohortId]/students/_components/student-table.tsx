'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { deleteStudent, deleteStudents } from '../_actions';
import { StudentSheet } from './student-sheet';

type Student = {
  id: string;
  name: string;
  organizations: { name: string }[] | { name: string } | null;
  department: string | null;
  job_title: string | null;
  job_role: string | null;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

function getOrgName(org: Student['organizations']): string {
  if (!org) return '-';
  if (Array.isArray(org)) return org[0]?.name ?? '-';
  return org.name;
}

const CATEGORY_CLASS: Record<OrganizationCategory, string> = {
  central: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  basic_local: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  metro_local: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
  public: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  education: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  unknown: 'border-border bg-muted text-muted-foreground'
};

export function StudentTable({ cohortId, students }: { cohortId: string; students: Student[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<OrganizationCategory | 'all'>('all');
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const categoryCounts = students.reduce((acc, student) => {
    const category = classifyOrganization(getOrgName(student.organizations));
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
    { value: 'unknown', label: ORGANIZATION_CATEGORY_LABEL.unknown, count: categoryCounts.unknown ?? 0 }
  ];
  const filteredStudents = categoryFilter === 'all'
    ? students
    : students.filter((student) => classifyOrganization(getOrgName(student.organizations)) === categoryFilter);
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
      <div className='text-muted-foreground rounded-md border p-8 text-center'>
        등록된 인원이 없습니다.
      </div>
    );
  }

  return (
    <>
      {/* 선택 툴바 */}
      {selected.size > 0 && (
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
              <th className='w-10 px-4 py-3'>
                <Checkbox
                  checked={isAllSelected}
                  data-indeterminate={isIndeterminate}
                  onCheckedChange={toggleAll}
                  aria-label='전체 선택'
                  className={isIndeterminate ? 'opacity-60' : ''}
                />
              </th>
              <th className='px-4 py-3 text-left font-medium'>이름</th>
              <th className='px-4 py-3 text-left font-medium'>소속</th>
              <th className='px-4 py-3 text-left font-medium'>생년월일</th>
              <th className='px-4 py-3 text-left font-medium'>이메일</th>
              <th className='w-20 px-4 py-3'></th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s) => {
              const orgName = getOrgName(s.organizations);
              const category = classifyOrganization(orgName);

              return (
                <tr
                  key={s.id}
                  className={`group border-b transition-colors last:border-0 hover:bg-muted/30 ${selected.has(s.id) ? 'bg-muted/40' : ''}`}
                >
                  <td className='px-4 py-3'>
                    <Checkbox
                      checked={selected.has(s.id)}
                      onCheckedChange={() => toggleOne(s.id)}
                      aria-label={`${s.name} 선택`}
                    />
                  </td>
                  <td className='px-4 py-3 font-medium'>{s.name}</td>
                  <td className='px-4 py-3'>
                    <div className='flex min-w-0 items-center gap-2'>
                      <Badge variant='outline' className={`shrink-0 ${CATEGORY_CLASS[category]}`}>
                        {ORGANIZATION_CATEGORY_LABEL[category]}
                      </Badge>
                      <span className='text-muted-foreground truncate'>{orgName}</span>
                    </div>
                  </td>
                  <td className='text-muted-foreground px-4 py-3'>{s.birth_date ?? '-'}</td>
                  <td className='text-muted-foreground px-4 py-3'>{s.email ?? '-'}</td>
                  <td className='px-4 py-3'>
                    <div className='flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                      <StudentSheet
                        cohortId={cohortId}
                        student={s}
                        trigger={
                          <Button variant='ghost' size='icon' className='h-7 w-7'>
                            <Icons.edit className='h-3.5 w-3.5' />
                          </Button>
                        }
                      />
                      <Button
                        variant='ghost'
                        size='icon'
                        className='text-destructive hover:text-destructive h-7 w-7'
                        onClick={() => { setDeleteError(null); setDeleteTarget(s); }}
                      >
                        <Icons.trash className='h-3.5 w-3.5' />
                      </Button>
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
