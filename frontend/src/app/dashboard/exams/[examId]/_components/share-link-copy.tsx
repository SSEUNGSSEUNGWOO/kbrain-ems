'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ShareLinkCopy({ shareCode }: { shareCode: string }) {
  const [origin, setOrigin] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const fullUrl = origin ? `${origin}/exam/share/${shareCode}` : `/exam/share/${shareCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — 유저가 수동 선택 */
    }
  };

  return (
    <div className='flex items-center gap-2'>
      <code className='flex-1 rounded bg-white border px-3 py-1.5 text-sm font-mono text-blue-900 break-all'>
        {fullUrl}
      </code>
      <Button
        variant='outline'
        size='sm'
        onClick={handleCopy}
        className='shrink-0 text-xs'
      >
        {copied ? '복사됨 ✓' : '복사'}
      </Button>
    </div>
  );
}
