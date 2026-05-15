'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { deleteInstructor } from '../_actions';
import { InstructorSheet, type Instructor } from './instructor-sheet';

type InstructorWithScore = Instructor & {
  avgScore: number | null;
  responseCount: number;
};

type Props = {
  instructors: InstructorWithScore[];
};

export function InstructorTable({ instructors }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`강사 "${name}"을(를) 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const result = await deleteInstructor(id);
      if (result?.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (instructors.length === 0) {
    return (
      <div className='rounded-xl border bg-card px-6 py-12 text-center text-muted-foreground'>
        등록된 강사가 없습니다. 우상단 &quot;+ 새 강사&quot; 버튼으로 추가하세요.
      </div>
    );
  }

  return (
    <div className='rounded-xl border bg-card'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>소속</TableHead>
            <TableHead>전공·전문분야</TableHead>
            <TableHead>연락처</TableHead>
            <TableHead className='text-right'>만족도</TableHead>
            <TableHead className='w-32 text-right'>관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {instructors.map((i) => (
            <TableRow key={i.id}>
              <TableCell className='font-medium'>
                <Link
                  href={`/dashboard/instructors/${i.id}`}
                  className='hover:underline'
                >
                  {i.name}
                </Link>
              </TableCell>
              <TableCell>{i.affiliation ?? '—'}</TableCell>
              <TableCell>{i.specialty ?? '—'}</TableCell>
              <TableCell className='text-sm text-muted-foreground'>
                {i.email && <div>{i.email}</div>}
                {i.phone && <div>{i.phone}</div>}
                {!i.email && !i.phone && '—'}
              </TableCell>
              <TableCell className='text-right tabular-nums'>
                <SatisfactionCell avg={i.avgScore} count={i.responseCount} />
              </TableCell>
              <TableCell className='text-right'>
                <div className='flex justify-end gap-1'>
                  <InstructorSheet
                    instructor={i}
                    trigger={
                      <Button variant='ghost' size='sm'>
                        수정
                      </Button>
                    }
                  />
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-destructive hover:text-destructive'
                    disabled={pending}
                    onClick={() => handleDelete(i.id, i.name)}
                  >
                    삭제
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SatisfactionCell({ avg, count }: { avg: number | null; count: number }) {
  if (avg === null) {
    return <span className='text-muted-foreground text-xs'>—</span>;
  }
  // 색조: 4.5+ emerald / 4.0+ blue / 3.5+ amber / 그 외 rose
  const tone =
    avg >= 9.0
      ? 'text-emerald-700 dark:text-emerald-300'
      : avg >= 8.0
        ? 'text-blue-700 dark:text-blue-300'
        : avg >= 7.0
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-rose-700 dark:text-rose-300';
  return (
    <span className='inline-flex items-baseline gap-1.5'>
      <span className={`font-semibold ${tone}`}>{avg.toFixed(2)}</span>
      <span className='text-muted-foreground text-xs'>/ 10</span>
      <span className='text-muted-foreground text-xs'>({count})</span>
    </span>
  );
}
