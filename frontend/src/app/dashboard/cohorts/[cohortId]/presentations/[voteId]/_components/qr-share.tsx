'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export function QrShare({
  url,
  resultUrl,
  qrDataUrl
}: {
  url: string;
  resultUrl: string;
  qrDataUrl: string;
}) {
  const [copied, setCopied] = useState<'vote' | 'result' | null>(null);

  const copy = async (value: string, type: 'vote' | 'result') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className='flex items-center gap-4'>
      <div className='relative h-40 w-40 shrink-0 rounded border bg-white p-2'>
        <Image src={qrDataUrl} alt='QR' fill className='object-contain p-2' unoptimized />
      </div>
      <div className='flex flex-col gap-2'>
        <div className='text-muted-foreground text-xs'>투표 참여 URL</div>
        <code className='bg-muted rounded px-2 py-1 text-xs break-all'>{url}</code>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={() => copy(url, 'vote')}>
            {copied === 'vote' ? '복사됨' : 'URL 복사'}
          </Button>
          <Button variant='outline' size='sm' asChild>
            <a href={qrDataUrl} download='presentation-vote-qr.png'>
              QR 저장
            </a>
          </Button>
        </div>
        <div className='mt-2 border-t pt-3'>
          <div className='text-muted-foreground mb-2 text-xs'>결과 발표 URL</div>
          <code className='bg-muted block rounded px-2 py-1 text-xs break-all'>{resultUrl}</code>
          <div className='mt-2 flex gap-2'>
            <Button variant='outline' size='sm' onClick={() => copy(resultUrl, 'result')}>
              {copied === 'result' ? '복사됨' : '결과 URL 복사'}
            </Button>
            <Button variant='outline' size='sm' asChild>
              <a href={resultUrl} target='_blank' rel='noreferrer'>
                결과 화면 열기
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
