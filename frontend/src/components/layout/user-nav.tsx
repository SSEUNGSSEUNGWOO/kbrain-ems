'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Icons } from '../icons';

export function UserNav() {
  const { name, role, title: authTitle } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/lock');
  };

  if (!name) return null;

  const roleLabel = role === 'developer' ? '개발자' : role === 'head' ? '총괄' : '운영자';
  const displayTitle = authTitle || roleLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className='flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm outline-none transition-colors hover:bg-accent'>
        <div className='flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'>
          {name.charAt(0)}
        </div>
        <span className='font-medium'>{name}</span>
        <span className='text-muted-foreground text-xs'>{displayTitle}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-44'>
        <DropdownMenuLabel className='font-normal'>
          <div className='text-sm font-medium'>{name}</div>
          <div className='text-xs text-muted-foreground'>
            {roleLabel} · {displayTitle}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/dashboard/account')}>
          <Icons.settings className='mr-2 h-4 w-4' />
          개인 설정
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className='text-destructive focus:text-destructive'>
          <Icons.logout className='mr-2 h-4 w-4' />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
