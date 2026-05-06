'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  classifyOrganization,
  ORGANIZATION_CATEGORY_LABEL,
  type OrganizationCategory
} from '@/lib/organization-category';
import { saveAssignmentSubmissions } from '../_actions';

const CATEGORY_CLASS: Record<OrganizationCategory, string> = {
  central: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  basic_local: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  metro_local: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
  public: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  education: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  unknown: 'border-border bg-muted text-muted-foreground'
};

const STATUS_OPTIONS = [
  { value: 'not_submitted', label: '미제출' },
  { value: 'submitted', label: '제출' },
  { value: 'late', label: '지각' }
] as const;

const STATUS_CLASS: Record<string, string> = {
  not_submitted: 'text-muted-foreground',
  submitted: 'text-green-600',
  late: 'text-orange-500'
};

type Student = {
  id: string;
  name: string;
  organizations: { name: string }[] | { name: string } | null;
};

type RecordMap = Record<string, {
  status: string;
  submitted_at: string | null;
  score: number | null;
  note: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
}>;

function getOrgName(org: Student['organizations']): string {
  if (!org) return '-';
  if (Array.isArray(org)) return org[0]?.name ?? '-';
  return org.name;
}

function parseScore(value: string): number | null {
  if (!value.trim()) return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

export function AssignmentSubmissionTable({
  assignmentId,
  cohortId,
  students,
  recordMap
}: {
  assignmentId: string;
  cohortId: string;
  students: Student[];
  recordMap: RecordMap;
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.status ?? 'not_submitted']))
  );
  const [submittedDates, setSubmittedDates] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.submitted_at ?? '']))
  );
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.score?.toString() ?? '']))
  );
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.note ?? '']))
  );
  const [filter, setFilter] = useState('all');
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const counts = Object.values(statuses).reduce((acc, status) => {
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filters = [
    { value: 'all', label: '전체', count: students.length, className: 'text-foreground' },
    { value: 'submitted', label: '제출', count: counts['submitted'] ?? 0, className: 'text-green-600' },
    { value: 'late', label: '지각', count: counts['late'] ?? 0, className: 'text-orange-500' },
    { value: 'not_submitted', label: '미제출', count: counts['not_submitted'] ?? 0, className: 'text-muted-foreground' }
  ];

  const filteredStudents = filter === 'all'
    ? students
    : students.filter((s) => statuses[s.id] === filter);

  const markAllSubmitted = () => {
    const today = new Date().toISOString().split('T')[0];
    setStatuses(Object.fromEntries(students.map((s) => [s.id, 'submitted'])));
    setSubmittedDates((prev) => Object.fromEntries(
      students.map((s) => [s.id, prev[s.id] || today])
    ));
    setSaved(false);
  };

  const handleSave = () => {
    setSaveError(null);
    setSaved(false);
    startTransition(async () => {
      const records = students.map((s) => {
        const status = statuses[s.id] ?? 'not_submitted';
        return {
          student_id: s.id,
          status,
          submitted_at: submittedDates[s.id] || null,
          score: parseScore(scores[s.id] ?? ''),
          note: notes[s.id] || null,
          file_path: null,
          file_name: null,
          file_size: null,
          file_type: null
        };
      });
      const result = await saveAssignmentSubmissions(assignmentId, cohortId, records);
      if (result?.error) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
    });
  };

  if (students.length === 0) {
    return (
      <div className='text-muted-foreground rounded-md border p-8 text-center'>
        등록된 교육생이 없습니다. 인원 관리에서 교육생을 먼저 추가해주세요.
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap gap-1'>
          {filters.map((f) => (
            <button
              key={f.value}
              type='button'
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-muted ' + f.className
                  : 'text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {f.label}
              <span className='ml-1.5 text-xs opacity-70'>{f.count}</span>
            </button>
          ))}
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={markAllSubmitted} disabled={pending}>
            전체 제출
          </Button>
          {saveError && <span className='text-destructive text-sm'>{saveError}</span>}
          {saved && <span className='text-sm text-green-600'>저장 완료</span>}
          <Button onClick={handleSave} disabled={pending}>
            {pending ? '저장 중...' : '전체 저장'}
          </Button>
        </div>
      </div>

      <div className='overflow-x-auto rounded-md border'>
        <table className='w-full min-w-[900px] text-sm'>
          <thead>
            <tr className='bg-muted/50 border-b'>
              <th className='px-4 py-3 text-left font-medium'>이름</th>
              <th className='px-4 py-3 text-left font-medium'>소속</th>
              <th className='w-32 px-4 py-3 text-left font-medium'>제출 상태</th>
              <th className='w-40 px-4 py-3 text-left font-medium'>제출일</th>
              <th className='w-28 px-4 py-3 text-left font-medium'>점수</th>
              <th className='px-4 py-3 text-left font-medium'>비고</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => {
              const status = statuses[student.id] ?? 'not_submitted';
              const isNotSubmitted = status === 'not_submitted';

              return (
                <tr key={student.id} className='border-b last:border-0'>
                  <td className='px-4 py-2 font-medium'>{student.name}</td>
                  <td className='px-4 py-2'>
                    {(() => {
                      const orgName = getOrgName(student.organizations);
                      const category = classifyOrganization(orgName);
                      return (
                        <div className='flex min-w-0 items-center gap-2'>
                          <Badge variant='outline' className={`min-w-[4.5rem] shrink-0 justify-center text-center ${CATEGORY_CLASS[category]}`}>
                            {ORGANIZATION_CATEGORY_LABEL[category]}
                          </Badge>
                          <span className='text-muted-foreground truncate'>{orgName}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className='px-4 py-2'>
                    <Select
                      value={status}
                      onValueChange={(value) => {
                        setStatuses((prev) => ({ ...prev, [student.id]: value }));
                        setSaved(false);
                      }}
                    >
                      <SelectTrigger className={`w-28 ${STATUS_CLASS[status] ?? ''}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className='px-4 py-2'>
                    <Input
                      type='date'
                      value={submittedDates[student.id] ?? ''}
                      disabled={isNotSubmitted}
                      onChange={(event) => {
                        setSubmittedDates((prev) => ({ ...prev, [student.id]: event.target.value }));
                        setSaved(false);
                      }}
                      className='h-8 text-sm'
                    />
                  </td>
                  <td className='px-4 py-2'>
                    <Input
                      type='number'
                      min='0'
                      step='0.1'
                      value={scores[student.id] ?? ''}
                      disabled={isNotSubmitted}
                      onChange={(event) => {
                        setScores((prev) => ({ ...prev, [student.id]: event.target.value }));
                        setSaved(false);
                      }}
                      className='h-8 text-sm'
                    />
                  </td>
                  <td className='px-4 py-2'>
                    <Input
                      placeholder='비고'
                      value={notes[student.id] ?? ''}
                      onChange={(event) => {
                        setNotes((prev) => ({ ...prev, [student.id]: event.target.value }));
                        setSaved(false);
                      }}
                      className='h-8 text-sm'
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className='flex justify-end gap-2'>
        {saveError && <span className='text-destructive text-sm'>{saveError}</span>}
        {saved && <span className='text-sm text-green-600'>저장 완료</span>}
        <Button onClick={handleSave} disabled={pending}>
          {pending ? '저장 중...' : '전체 저장'}
        </Button>
      </div>
    </div>
  );
}
