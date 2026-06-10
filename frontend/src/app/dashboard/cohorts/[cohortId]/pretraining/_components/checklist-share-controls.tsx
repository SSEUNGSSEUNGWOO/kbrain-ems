'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { publishChecklist, revokeChecklist } from '../_actions';

type Props = {
  cohortId: string;
  checklistId: string;
  initialCode: string | null;
};

export function ChecklistShareControls({ cohortId, checklistId, initialCode }: Props) {
  const [code, setCode] = useState<string | null>(initialCode);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const url =
    code && typeof window !== 'undefined'
      ? `${window.location.origin}/pretraining/${code}`
      : code
        ? `/pretraining/${code}`
        : '';

  const onPublish = () => {
    startTransition(async () => {
      const res = await publishChecklist(cohortId, checklistId);
      if (res.code !== undefined) setCode(res.code ?? null);
    });
  };

  const onRevoke = () => {
    if (!confirm('공유 링크를 회수하면 외부에서 응답할 수 없게 됩니다. 회수할까요?')) return;
    startTransition(async () => {
      const res = await revokeChecklist(cohortId, checklistId);
      if (!res.error) setCode(null);
    });
  };

  const onCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  if (!code) {
    return (
      <Button size='sm' onClick={onPublish} disabled={pending}>
        {pending ? '발행 중...' : '발행 + 링크 발급'}
      </Button>
    );
  }

  return (
    <div className='flex items-center gap-1'>
      <Button size='sm' variant='outline' onClick={onCopy}>
        {copied ? '복사됨' : '링크 복사'}
      </Button>
      <Button size='sm' variant='ghost' onClick={onRevoke} disabled={pending}>
        회수
      </Button>
    </div>
  );
}
