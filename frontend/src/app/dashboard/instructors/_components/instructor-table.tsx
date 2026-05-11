'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

type Props = {
  instructors: Instructor[];
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
            <TableHead>메모</TableHead>
            <TableHead className='w-32 text-right'>관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {instructors.map((i) => (
            <TableRow key={i.id}>
              <TableCell className='font-medium'>{i.name}</TableCell>
              <TableCell>{i.affiliation ?? '—'}</TableCell>
              <TableCell>{i.specialty ?? '—'}</TableCell>
              <TableCell className='text-sm text-muted-foreground'>
                {i.email && <div>{i.email}</div>}
                {i.phone && <div>{i.phone}</div>}
                {!i.email && !i.phone && '—'}
              </TableCell>
              <TableCell className='text-sm text-muted-foreground'>{i.notes ?? '—'}</TableCell>
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
