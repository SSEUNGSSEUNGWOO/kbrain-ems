'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from '@/components/ui/sidebar';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Icons } from '../icons';

type Cohort = { id: string; name: string };

const DOMAINS = [
  { slug: 'students', label: '인원 관리' },
  { slug: 'attendance', label: '출결' },
  { slug: 'assignments', label: '과제' },
  { slug: 'completion', label: '수료' }
] as const;

export default function AppSidebar() {
  const pathname = usePathname();
  const [cohorts, setCohorts] = React.useState<Cohort[]>([]);

  const activeCohortId = pathname.match(/^\/dashboard\/cohorts\/([^/]+)/)?.[1] ?? null;
  const isInsideCohorts = pathname.startsWith('/dashboard/cohorts');

  React.useEffect(() => {
    const supabase = createClient();
    supabase
      .from('cohorts')
      .select('id, name')
      .order('created_at', { ascending: false })
      .then(({ data }) => setCohorts(data ?? []));
  }, []);

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader className='p-4'>
        <Link href='/dashboard/cohorts' className='flex items-center gap-2 font-semibold'>
          <Icons.galleryVerticalEnd className='h-5 w-5 shrink-0' />
          <span className='truncate text-sm'>교육과정 관리</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className='overflow-x-hidden'>
        <SidebarGroup className='py-0'>
          <SidebarGroupLabel>메뉴</SidebarGroupLabel>
          <SidebarMenu>

            {/* 대시보드 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='대시보드'
                isActive={pathname === '/dashboard/overview'}
              >
                <Link href='/dashboard/overview'>
                  <Icons.dashboard />
                  <span>대시보드</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* 기수 목록 — 펼치면 기수 트리 표시 */}
            <Collapsible
              asChild
              defaultOpen={isInsideCohorts}
              className='group/collapsible'
            >
              <SidebarMenuItem>
                <div className='flex items-center'>
                  <SidebarMenuButton
                    asChild
                    tooltip='교육과정'
                    isActive={pathname === '/dashboard/cohorts'}
                    className='flex-1'
                  >
                    <Link href='/dashboard/cohorts'>
                      <Icons.galleryVerticalEnd />
                      <span>교육과정</span>
                    </Link>
                  </SidebarMenuButton>
                  <CollapsibleTrigger className='hover:bg-accent mr-1 rounded p-1'>
                    <Icons.chevronRight className='h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                  </CollapsibleTrigger>
                </div>

                <CollapsibleContent>
                  <SidebarMenuSub>
                    {cohorts.length === 0 && (
                      <SidebarMenuSubItem>
                        <span className='text-muted-foreground px-2 py-1 text-xs'>등록된 기수 없음</span>
                      </SidebarMenuSubItem>
                    )}
                    {cohorts.map((cohort) => (
                      <SidebarMenuSubItem key={cohort.id}>
                        <Collapsible
                          defaultOpen={activeCohortId === cohort.id}
                          className='group/cohort w-full'
                        >
                          <div className='flex items-center'>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === `/dashboard/cohorts/${cohort.id}`}
                              className='flex-1'
                            >
                              <Link href={`/dashboard/cohorts/${cohort.id}`}>
                                <span className='truncate'>{cohort.name}</span>
                              </Link>
                            </SidebarMenuSubButton>
                            <CollapsibleTrigger className='hover:bg-accent mr-1 rounded p-1'>
                              <Icons.chevronRight className='h-3 w-3 transition-transform duration-200 group-data-[state=open]/cohort:rotate-90' />
                            </CollapsibleTrigger>
                          </div>

                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {DOMAINS.map((d) => (
                                <SidebarMenuSubItem key={d.slug}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={pathname.startsWith(
                                      `/dashboard/cohorts/${cohort.id}/${d.slug}`
                                    )}
                                  >
                                    <Link href={`/dashboard/cohorts/${cohort.id}/${d.slug}`}>
                                      <span>{d.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </Collapsible>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>

          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
