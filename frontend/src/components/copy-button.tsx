'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  text: string;
  html?: string;
  label?: string;
  size?: 'default' | 'sm';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
};

// 한글 워드프로세서가 HTML 표를 인식하므로 표는 text/html + text/plain(TSV) 둘 다 클립보드에 쓴다.
// 평문은 text/plain만.
export function CopyButton({
  text,
  html,
  label = '복사',
  size = 'sm',
  variant = 'outline',
  className
}: Props) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      if (html && typeof window !== 'undefined' && 'ClipboardItem' in window) {
        const item = new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' })
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // 복사 실패 — 사용자 알림 없이 silent. 브라우저 보안 이슈일 가능성.
      }
    }
  }

  return (
    <Button
      type='button'
      size={size}
      variant={variant}
      onClick={onCopy}
      className={cn(className)}
    >
      {copied ? '✓ 복사됨' : label}
    </Button>
  );
}
