'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  onClose: () => void;
  label: string;
  url: string;
  /** PNG 다운로드 파일명 prefix */
  filenamePrefix?: string;
};

// 라벨이 인쇄돼 있는 합성 PNG 생성
async function buildLabeledQrDataUrl(url: string, label: string): Promise<string> {
  const qrPx = 512;
  const labelHeight = 110;
  const padding = 32;
  const totalW = qrPx + padding * 2;
  const totalH = qrPx + labelHeight + padding * 2;

  // 1) QR을 별도 캔버스에 직접 그리기 (Image 우회)
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: qrPx,
    color: { dark: '#0f172a', light: '#ffffff' }
  });

  // 2) 최종 합성 캔버스
  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');

  // 흰 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // QR 그리기 (이미 그려진 캔버스를 그대로 drawImage)
  ctx.drawImage(qrCanvas, padding, padding, qrPx, qrPx);

  // 라벨 (QR 아래 가운데)
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // 폰트 크기 결정 — 너무 길면 줄임
  const maxWidth = qrPx;
  let fontSize = 36;
  ctx.font = `bold ${fontSize}px "맑은 고딕", "Malgun Gothic", system-ui, sans-serif`;
  while (ctx.measureText(label).width > maxWidth && fontSize > 18) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px "맑은 고딕", "Malgun Gothic", system-ui, sans-serif`;
  }

  ctx.fillText(label, totalW / 2, padding + qrPx + 24);

  return canvas.toDataURL('image/png');
}

export function QrDialog({ open, onClose, label, url, filenamePrefix = 'qr' }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!open || !url) {
      setDataUrl(null);
      return;
    }
    buildLabeledQrDataUrl(url, label)
      .then((d) => {
        if (!cancelledRef.current) setDataUrl(d);
      })
      .catch(() => {
        if (!cancelledRef.current) setDataUrl(null);
      });
    return () => {
      cancelledRef.current = true;
    };
  }, [open, url, label]);

  const downloadPng = () => {
    if (!dataUrl) return;
    const safeLabel = label.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${filenamePrefix}-${safeLabel}.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>QR 코드</DialogTitle>
        </DialogHeader>
        <div className='flex flex-col items-center gap-3 pb-2 pt-2'>
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt='QR 코드'
              className='w-72 rounded-lg ring-1 ring-slate-200'
            />
          ) : (
            <div className='flex h-80 w-72 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400'>
              생성 중...
            </div>
          )}
          <p className='break-all text-center text-xs text-slate-500'>{url}</p>
          <div className='flex w-full gap-2'>
            <Button
              variant='outline'
              className='flex-1'
              onClick={() => {
                if (url) void navigator.clipboard.writeText(url);
              }}
            >
              URL 복사
            </Button>
            <Button className='flex-1' onClick={downloadPng} disabled={!dataUrl}>
              PNG 다운로드
            </Button>
          </div>
          <p className='text-center text-[11px] text-slate-400'>
            화면을 학생들에게 보여주거나 PNG 저장 후 출력해 부착하세요.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
