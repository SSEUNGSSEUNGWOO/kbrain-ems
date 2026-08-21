'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { DispatchTemplate } from '@/lib/dispatch-stages';

import { previewAutoDispatch, runAutoDispatch, type AutoDispatchPreview } from '../_auto-actions';

// 자동 발송 미리보기·승인.
//
// 줌 링크 하나 틀리면 교육생 전원이 못 들어온다. 실물 문자는 되돌릴 수 없으므로 승인 단계를
// 없애지 않는다 — 발송문 전문과 함께 기계가 걸러낸 것을 같이 보여주고 사람이 누른다.

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cohortId: string;
  template: DispatchTemplate;
  stageLabel: string;
};

export function AutoDispatchDialog({ open, onOpenChange, cohortId, template, stageLabel }: Props) {
  const [preview, setPreview] = useState<AutoDispatchPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, startSending] = useTransition();

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setError(null);
    setLoading(true);
    previewAutoDispatch(cohortId, template)
      .then((res) => {
        if (res.ok) setPreview(res.data);
        else setError(res.error);
      })
      .finally(() => setLoading(false));
  }, [open, cohortId, template]);

  const handleSend = () => {
    startSending(async () => {
      const res = await runAutoDispatch(cohortId, template);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const d = res.data;
      const prefix = d.dryRun ? '[드라이런] ' : '';
      if (d.failed > 0) {
        toast.error(`${prefix}${d.sent}건 발송 · ${d.failed}건 실패`, {
          description: d.errors.join('\n')
        });
      } else {
        toast.success(
          `${prefix}${d.sent}건 발송${d.skipped > 0 ? ` · ${d.skipped}건은 이미 발송돼 건너뜀` : ''}`
        );
      }
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            자동 발송 — {stageLabel}
            {preview?.dryRun && (
              <Badge variant='outline' className='border-amber-300 bg-amber-50 text-amber-700'>
                드라이런
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {preview?.dryRun
              ? '타스온 API 키가 없어 실제 전송 없이 이력만 기록합니다.'
              : '실제 문자가 발송됩니다. 되돌릴 수 없습니다.'}
          </DialogDescription>
        </DialogHeader>

        {loading && <p className='text-muted-foreground text-sm'>대상자 계산 중…</p>}
        {error && <p className='text-sm text-red-600'>{error}</p>}

        {preview && (
          <div className='space-y-4'>
            <div className='grid grid-cols-3 gap-2'>
              <Stat label='발송 대상' value={`${preview.pendingCount}명`} tone='primary' />
              <Stat label='이미 발송' value={`${preview.alreadySentCount}명`} />
              <Stat label='제외' value={`${preview.excluded.length}명`} />
            </div>

            <div>
              <p className='mb-1 text-sm font-medium'>배치 구성</p>
              {preview.batchSizes.length === 0 ? (
                <p className='text-muted-foreground text-sm'>보낼 대상이 없습니다.</p>
              ) : (
                <p className='text-sm'>
                  {preview.batchSizes.length}개 배치 —{' '}
                  <span className='font-mono'>{preview.batchSizes.join(' + ')}</span>
                  <span className='text-muted-foreground'> (타스온 1회 100건 제한)</span>
                </p>
              )}
            </div>

            <div>
              <p className='mb-1 text-sm font-medium'>발송문</p>
              <Textarea readOnly value={preview.message} className='h-40 font-mono text-xs' />
            </div>

            {preview.excluded.length > 0 && (
              <div>
                <p className='mb-1 text-sm font-medium'>제외된 대상 {preview.excluded.length}명</p>
                <div className='max-h-40 overflow-y-auto rounded-md border'>
                  <table className='w-full text-xs'>
                    <tbody>
                      {preview.excluded.map((e, i) => (
                        <tr key={`${e.name}-${i}`} className='border-b last:border-0'>
                          <td className='px-2 py-1'>{e.name}</td>
                          <td className='text-muted-foreground px-2 py-1 font-mono'>
                            {e.phone ?? '—'}
                          </td>
                          <td className='px-2 py-1 text-amber-700'>{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || loading || !preview || preview.pendingCount === 0}
          >
            {sending
              ? '발송 중…'
              : `${preview?.pendingCount ?? 0}명에게 발송${preview?.dryRun ? ' (드라이런)' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'primary' }) {
  return (
    <div className='rounded-md border p-2'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className={`text-lg font-semibold ${tone === 'primary' ? 'text-primary' : ''}`}>
        {value}
      </div>
    </div>
  );
}
