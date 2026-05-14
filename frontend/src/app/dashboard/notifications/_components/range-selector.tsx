'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const RANGES = [
  { value: '7', label: '7일' },
  { value: '14', label: '14일' },
  { value: '30', label: '30일' }
];

type Props = { current: number };

export function RangeSelector({ current }: Props) {
  const pathname = usePathname();
  return (
    <div className='bg-muted/50 inline-flex rounded-md border p-0.5'>
      {RANGES.map((r) => {
        const isActive = String(current) === r.value;
        return (
          <Link
            key={r.value}
            href={`${pathname}?range=${r.value}`}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              isActive
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}
