'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export function QrShare({ url, qrDataUrl }: { url: string; qrDataUrl: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
        <div className='text-muted-foreground text-xs'>공유 URL</div>
        <code className='bg-muted rounded px-2 py-1 text-xs break-all'>{url}</code>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={copy}>
            {copied ? '복사됨' : 'URL 복사'}
          </Button>
          <Button variant='outline' size='sm' asChild>
            <a href={qrDataUrl} download='presentation-vote-qr.png'>
              QR 저장
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
