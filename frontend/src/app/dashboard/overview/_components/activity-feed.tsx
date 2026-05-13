import Link from 'next/link';
import { Icons } from '@/components/icons';

export type ActivityType = 'application' | 'survey' | 'assignment';

export type Activity = {
  id: string;
  type: ActivityType;
  time: string;
  primary: string;
  secondary: string;
  href?: string;
};

const TYPE_CONFIG: Record<ActivityType, { icon: keyof typeof Icons; tone: string; label: string }> =
  {
    application: {
      icon: 'userPen',
      tone: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
      label: '신청'
    },
    survey: {
      icon: 'forms',
      tone: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
      label: '설문 응답'
    },
    assignment: {
      icon: 'upload',
      tone: 'bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
      label: '과제 제출'
    }
  };

export function ActivityFeed({ items }: { items: Activity[] }) {
  if (items.length === 0) {
    return <div className='text-muted-foreground py-12 text-center text-sm'>최근 활동 없음</div>;
  }
  return (
    <ul className='divide-y'>
      {items.map((a) => {
        const cfg = TYPE_CONFIG[a.type];
        const Icon = Icons[cfg.icon];
        const body = (
          <div className='flex items-start gap-3 py-3'>
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cfg.tone}`}
            >
              <Icon className='size-3.5' />
            </div>
            <div className='min-w-0 flex-1'>
              <div className='text-sm'>
                <span className='font-medium'>{a.primary}</span>
                <span className='text-muted-foreground'> · {cfg.label}</span>
              </div>
              <div className='text-muted-foreground truncate text-xs'>{a.secondary}</div>
            </div>
            <div className='text-muted-foreground shrink-0 text-xs'>{a.time}</div>
          </div>
        );
        return (
          <li key={a.id}>
            {a.href ? (
              <Link
                href={a.href}
                className='hover:bg-muted/50 -mx-2 block rounded-md px-2 transition-colors'
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
