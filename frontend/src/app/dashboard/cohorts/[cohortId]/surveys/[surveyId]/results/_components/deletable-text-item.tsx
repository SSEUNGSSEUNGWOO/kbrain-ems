'use client';

import { useTransition } from 'react';
import { Icons } from '@/components/icons';
import { deleteTextAnswer } from '../_actions';

type Props = {
  cohortId: string;
  surveyId: string;
  responseId: string;
  questionId: string;
  text: string;
  /** 컨테이너 li 스타일 (서술형 vs 불만족 사유에서 색상이 다름) */
  className?: string;
};

export function DeletableTextItem({
  cohortId,
  surveyId,
  responseId,
  questionId,
  text,
  className
}: Props) {
  const [pending, startTransition] = useTransition();

  const onDelete = () => {
    if (!window.confirm('이 응답을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    startTransition(async () => {
      const res = await deleteTextAnswer(cohortId, surveyId, responseId, questionId);
      if (res.error) window.alert(res.error);
    });
  };

  return (
    <li
      className={`group relative whitespace-pre-wrap rounded-md border px-3 py-2 pr-9 text-sm ${
        className ?? 'bg-muted/30'
      } ${pending ? 'opacity-50' : ''}`}
    >
      {text}
      <button
        type='button'
        onClick={onDelete}
        disabled={pending}
        aria-label='응답 삭제'
        className='absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100 disabled:pointer-events-none'
      >
        <Icons.trash className='size-3.5' />
      </button>
    </li>
  );
}
