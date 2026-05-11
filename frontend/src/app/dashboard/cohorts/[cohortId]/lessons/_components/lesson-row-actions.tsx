'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { deleteLesson } from '../_actions';

type Props = {
  cohortId: string;
  sessionId: string;
};

export function LessonRowActions({ cohortId, sessionId }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm('이 수업을 삭제하시겠습니까? 연결된 출결 데이터와 만족도 설문(있다면)도 함께 삭제됩니다.')) return;
    startTransition(async () => {
      const result = await deleteLesson(cohortId, sessionId);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className='flex justify-end gap-1'>
      <Button asChild variant='ghost' size='sm'>
        <Link href={`/dashboard/cohorts/${cohortId}/lessons/${sessionId}/edit`}>수정</Link>
      </Button>
      <Button variant='ghost' size='sm' onClick={handleDelete} disabled={pending}>
        {pending ? '삭제 중...' : '삭제'}
      </Button>
    </div>
  );
}
