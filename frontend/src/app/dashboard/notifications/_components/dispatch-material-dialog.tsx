'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { fetchDispatchMaterialBundle, type DispatchMaterial } from '../_actions';
import type { DispatchTemplate } from '@/lib/dispatch-stages';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cohortId: string;
  templates: DispatchTemplate[];
  stageLabel: string;
};

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} 복사됨`);
  } catch {
    toast.error('클립보드 복사 실패 — 브라우저 권한을 확인해 주세요');
  }
}

export function DispatchMaterialDialog({
  open,
  onOpenChange,
  cohortId,
  templates,
  stageLabel
}: Props) {
  const [loading, setLoading] = useState(false);
  const [material, setMaterial] = useState<DispatchMaterial | null>(null);
  const [body, setBody] = useState('');
  const templatesKey = templates.join(',');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setMaterial(null);
    fetchDispatchMaterialBundle(cohortId, templates)
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          onOpenChange(false);
          return;
        }
        setMaterial(res.data);
        setBody(res.data.body);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cohortId, templatesKey]);

  const emails = (material?.recipients ?? [])
    .filter((r) => r.email)
    .map((r) => `${r.name} <${r.email}>`);
  const phones = (material?.recipients ?? [])
    .map((r) => r.phone)
    .filter((x): x is string => !!x);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0'>
        <DialogHeader className='border-b px-6 pt-6 pb-4'>
          <DialogTitle>{stageLabel} — 발송 자료</DialogTitle>
          <DialogDescription>
            {loading ? '대상자 명단을 불러오는 중...' : material
              ? `대상자 ${material.recipients.length}명 · 외부 메일·문자 도구에 복사해 발송하세요`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {material && (
          <div className='flex-1 space-y-4 overflow-y-auto px-6 py-4'>
            <Section
              title={`이메일 (${emails.length}명, BCC 발송용)`}
              content={emails.join(', ')}
              onCopy={() => copyToClipboard(emails.join(', '), '이메일 목록')}
              missing={emails.length === 0}
              missingLabel='이메일이 등록된 학생이 없습니다.'
            />
            <Section
              title={`전화번호 (${phones.length}명, 단체문자용)`}
              content={phones.join(', ')}
              onCopy={() => copyToClipboard(phones.join(', '), '전화번호 목록')}
              missing={phones.length === 0}
              missingLabel='전화번호가 등록된 학생이 없습니다.'
            />

            <div>
              <div className='mb-1.5 flex items-center justify-between'>
                <span className='text-sm font-medium'>제목</span>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => copyToClipboard(material.subject, '제목')}
                >
                  복사
                </Button>
              </div>
              <div className='bg-muted/40 rounded-md border px-3 py-2 text-sm'>
                {material.subject}
              </div>
            </div>

            <div>
              <div className='mb-1.5 flex items-center justify-between'>
                <span className='text-sm font-medium'>본문 (편집 가능)</span>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => copyToClipboard(body, '본문')}
                >
                  복사
                </Button>
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className='font-mono text-xs'
              />
            </div>
          </div>
        )}

        <DialogFooter className='border-t px-6 py-4'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  content,
  onCopy,
  missing,
  missingLabel
}: {
  title: string;
  content: string;
  onCopy: () => void;
  missing: boolean;
  missingLabel: string;
}) {
  return (
    <div>
      <div className='mb-1.5 flex items-center justify-between'>
        <span className='text-sm font-medium'>{title}</span>
        {!missing && (
          <Button variant='ghost' size='sm' onClick={onCopy}>
            복사
          </Button>
        )}
      </div>
      {missing ? (
        <div className='text-muted-foreground bg-muted/40 rounded-md border px-3 py-2 text-xs'>
          {missingLabel}
        </div>
      ) : (
        <div className='bg-muted/40 max-h-24 overflow-y-auto rounded-md border px-3 py-2 text-xs break-all'>
          {content}
        </div>
      )}
    </div>
  );
}
