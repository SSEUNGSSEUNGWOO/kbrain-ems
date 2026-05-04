'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { saveAssignmentSubmissions } from '../_actions';

const BUCKET = 'assignment-submissions';

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

function formatFileSize(size: number | null): string {
  if (!size) return '';
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function sanitizeFileName(name: string): string {
  return name.replaceAll(/[^\w.-]+/g, '_');
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
  const [filePaths, setFilePaths] = useState<Record<string, string | null>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.file_path ?? null]))
  );
  const [fileNames, setFileNames] = useState<Record<string, string | null>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.file_name ?? null]))
  );
  const [fileSizes, setFileSizes] = useState<Record<string, number | null>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.file_size ?? null]))
  );
  const [fileTypes, setFileTypes] = useState<Record<string, string | null>>(
    Object.fromEntries(students.map((s) => [s.id, recordMap[s.id]?.file_type ?? null]))
  );
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | undefined>>({});
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
      const supabase = createClient();
      const nextFilePaths = { ...filePaths };
      const nextFileNames = { ...fileNames };
      const nextFileSizes = { ...fileSizes };
      const nextFileTypes = { ...fileTypes };

      for (const student of students) {
        const file = selectedFiles[student.id];
        if (!file) continue;

        const storagePath = [
          cohortId,
          assignmentId,
          `${student.id}-${Date.now()}-${sanitizeFileName(file.name)}`
        ].join('/');

        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: file.type || 'application/octet-stream'
          });

        if (error) {
          setSaveError(`${student.name} 파일 업로드 실패: ${error.message}`);
          return;
        }

        nextFilePaths[student.id] = storagePath;
        nextFileNames[student.id] = file.name;
        nextFileSizes[student.id] = file.size;
        nextFileTypes[student.id] = file.type || null;
      }

      const records = students.map((s) => {
        const status = statuses[s.id] ?? 'not_submitted';
        return {
          student_id: s.id,
          status,
          submitted_at: submittedDates[s.id] || null,
          score: parseScore(scores[s.id] ?? ''),
          note: notes[s.id] || null,
          file_path: nextFilePaths[s.id] ?? null,
          file_name: nextFileNames[s.id] ?? null,
          file_size: nextFileSizes[s.id] ?? null,
          file_type: nextFileTypes[s.id] ?? null
        };
      });
      const result = await saveAssignmentSubmissions(assignmentId, cohortId, records);
      if (result?.error) {
        setSaveError(result.error);
        return;
      }
      setFilePaths(nextFilePaths);
      setFileNames(nextFileNames);
      setFileSizes(nextFileSizes);
      setFileTypes(nextFileTypes);
      setSelectedFiles({});
      setSaved(true);
    });
  };

  const openFile = async (path: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60);

    if (error) {
      setSaveError(`파일 링크 생성 실패: ${error.message}`);
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
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
        <table className='w-full min-w-[1100px] text-sm'>
          <thead>
            <tr className='bg-muted/50 border-b'>
              <th className='px-4 py-3 text-left font-medium'>이름</th>
              <th className='px-4 py-3 text-left font-medium'>소속</th>
              <th className='w-32 px-4 py-3 text-left font-medium'>제출 상태</th>
              <th className='w-40 px-4 py-3 text-left font-medium'>제출일</th>
              <th className='w-28 px-4 py-3 text-left font-medium'>점수</th>
              <th className='w-64 px-4 py-3 text-left font-medium'>제출 파일</th>
              <th className='px-4 py-3 text-left font-medium'>비고</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => {
              const status = statuses[student.id] ?? 'not_submitted';
              const isNotSubmitted = status === 'not_submitted';
              const filePath = filePaths[student.id];
              const fileName = fileNames[student.id];
              const fileSize = fileSizes[student.id];

              return (
                <tr key={student.id} className='border-b last:border-0'>
                  <td className='px-4 py-2 font-medium'>{student.name}</td>
                  <td className='text-muted-foreground px-4 py-2'>{getOrgName(student.organizations)}</td>
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
                    <div className='grid gap-1'>
                      {filePath && fileName && (
                        <button
                          type='button'
                          onClick={() => openFile(filePath)}
                          className='text-primary truncate text-left text-xs hover:underline'
                        >
                          {fileName}
                          {fileSize ? ` (${formatFileSize(fileSize)})` : ''}
                        </button>
                      )}
                      <Input
                        type='file'
                        disabled={isNotSubmitted}
                        onChange={(event) => {
                          setSelectedFiles((prev) => ({
                            ...prev,
                            [student.id]: event.target.files?.[0]
                          }));
                          setSaved(false);
                        }}
                        className='h-8 text-xs'
                      />
                    </div>
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
