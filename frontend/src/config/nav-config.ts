import { NavGroup } from '@/types';

/**
 * 사이드바 + Cmd+K 네비게이션 설정.
 *
 * 각 항목의 `access` 필드로 RBAC를 적용할 수 있다 (예: { requireOrg: true },
 * { permission: 'org:teams:manage' }, { plan: 'pro' }, { role: 'admin' }).
 * 인증/RBAC는 추후 Supabase Auth 도입 시점에 활성화한다.
 */
export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        title: 'Dashboard',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['d', 'd'],
        items: []
      }
    ]
  },
  {
    label: '교육과정',
    items: [
      {
        title: '모집',
        url: '/dashboard/recruitment',
        icon: 'teams',
        isActive: false,
        items: []
      },
      {
        title: '선발',
        url: '/dashboard/selection',
        icon: 'checks',
        isActive: false,
        items: []
      },
      {
        title: '출결',
        url: '/dashboard/attendance',
        icon: 'calendar',
        isActive: false,
        items: []
      },
      {
        title: '과제',
        url: '/dashboard/assignments',
        icon: 'forms',
        isActive: false,
        items: []
      },
      {
        title: '수료',
        url: '/dashboard/completion',
        icon: 'circleCheck',
        isActive: false,
        items: []
      },
      {
        title: '인증',
        url: '/dashboard/certification',
        icon: 'badgeCheck',
        isActive: false,
        items: []
      }
    ]
  }
];
