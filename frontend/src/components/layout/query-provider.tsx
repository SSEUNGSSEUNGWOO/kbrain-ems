'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { usePathname } from 'next/navigation';
import { getQueryClient } from '@/lib/query-client';
import type * as React from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const pathname = usePathname();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {!pathname.startsWith('/vote') && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
