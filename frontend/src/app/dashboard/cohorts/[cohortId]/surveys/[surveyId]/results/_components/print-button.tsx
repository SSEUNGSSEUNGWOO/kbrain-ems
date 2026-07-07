'use client';

import { Button } from '@/components/ui/button';

export function PrintPdfButton() {
  return (
    <Button variant='outline' onClick={() => window.print()}>
      PDF 저장
    </Button>
  );
}
