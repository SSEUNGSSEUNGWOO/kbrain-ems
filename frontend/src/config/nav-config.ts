import { NavGroup } from '@/types';

/**
 * 사이드바 + Cmd+K 네비게이션 정적 설정.
 *
 * URL이 /dashboard/cohorts/[id]/... 컨텍스트일 때는 AppSidebar에서
 * 동적으로 "교육과정" 그룹(6 도메인)을 덧붙인다.
 *
 * 각 항목의 `access` 필드로 RBAC 적용 가능. 인증/RBAC는 추후
 * Supabase Auth 도입 시점에 활성화한다.
 */
export const navGroups: NavGroup[] = [
  {
    label: '메뉴',
    items: [
      {
        title: '대시보드',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['d', 'd'],
        items: []
      },
      {
        title: '교육과정',
        url: '/dashboard/cohorts',
        icon: 'galleryVerticalEnd',
        isActive: false,
        shortcut: ['c', 'c'],
        items: []
      }
    ]
  }
];
