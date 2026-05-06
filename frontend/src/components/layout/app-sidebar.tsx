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
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useAuth } from '@/lib/auth-context';
import { Icons } from '../icons';

type Cohort = { id: string; name: string };

const DOMAINS = [
  { slug: 'students', label: '인원 관리', icon: 'teams' as const, color: 'text-blue-500' },
  { slug: 'attendance', label: '출결', icon: 'circleCheck' as const, color: 'text-emerald-500' },
  { slug: 'assignments', label: '과제', icon: 'forms' as const, color: 'text-amber-500' },
  { slug: 'completion', label: '수료', icon: 'badgeCheck' as const, color: 'text-violet-500' }
] as const;

export default function AppSidebar() {
  const pathname = usePathname();
  const { isDeveloper } = useAuth();
  const [cohorts, setCohorts] = React.useState<Cohort[]>([]);

  const activeCohortId = pathname.match(/^\/dashboard\/cohorts\/([^/]+)/)?.[1] ?? null;
  const isInsideCohorts = pathname.startsWith('/dashboard/cohorts');

  React.useEffect(() => {
    fetch('/api/cohorts-list')
      .then((res) => res.json())
      .then((data) => setCohorts(data ?? []))
      .catch(() => setCohorts([]));
  }, []);

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader className='border-sidebar-border border-b p-0'>
        <Link
          href='/dashboard/overview'
          className='relative flex flex-col items-start gap-2 overflow-hidden px-5 py-5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-3'
        >
          {/* 배경 장식 */}
          <div className='pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-400/10 blur-2xl' />
          <div className='pointer-events-none absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-violet-400/10 blur-2xl' />

          <Image
            src='/k-brain-logo.png'
            alt='K-Brain'
            width={3233}
            height={1326}
            className='relative h-7 w-auto shrink-0 dark:brightness-0 dark:invert group-data-[collapsible=icon]:hidden'
          />
          <div className='relative flex items-center gap-1.5 group-data-[collapsible=icon]:hidden'>
            <span className='inline-block h-1 w-1 rounded-full bg-blue-500' />
            <span className='text-[10.5px] font-semibold uppercase tracking-[0.15em] text-muted-foreground'>
              Education Management
            </span>
          </div>
          <Icons.galleryVerticalEnd className='relative hidden h-6 w-6 shrink-0 text-primary group-data-[collapsible=icon]:block' />
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
                  <Icons.dashboard className='text-blue-600 dark:text-blue-400' />
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
                <div className='flex w-full items-center'>
                  <SidebarMenuButton
                    asChild
                    tooltip='교육과정'
                    isActive={pathname === '/dashboard/cohorts'}
                    className='flex-1'
                  >
                    <Link href='/dashboard/cohorts'>
                      <Icons.galleryVerticalEnd className='text-violet-600 dark:text-violet-400' />
                      <span>교육과정</span>
                    </Link>
                  </SidebarMenuButton>
                  <CollapsibleTrigger className='hover:bg-accent shrink-0 rounded p-1 group-data-[collapsible=icon]:hidden'>
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
                          <div className='flex w-full items-center'>
                            <SidebarMenuSubButton
                              asChild
                              className='flex-1'
                              isActive={pathname === `/dashboard/cohorts/${cohort.id}`}
                            >
                              <Link href={`/dashboard/cohorts/${cohort.id}`}>
                                <span className={`h-2 w-2 shrink-0 rounded-full ${activeCohortId === cohort.id ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                                <span className='truncate'>{cohort.name}</span>
                              </Link>
                            </SidebarMenuSubButton>
                            <CollapsibleTrigger className='hover:bg-accent shrink-0 rounded p-1'>
                              <Icons.chevronRight className='h-3 w-3 transition-transform duration-200 group-data-[state=open]/cohort:rotate-90' />
                            </CollapsibleTrigger>
                          </div>

                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {DOMAINS.map((d) => {
                                const DomainIcon = Icons[d.icon];
                                return (
                                  <SidebarMenuSubItem key={d.slug}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={pathname.startsWith(
                                        `/dashboard/cohorts/${cohort.id}/${d.slug}`
                                      )}
                                    >
                                      <Link href={`/dashboard/cohorts/${cohort.id}/${d.slug}`}>
                                        <DomainIcon className={`h-3.5 w-3.5 shrink-0 ${d.color}`} />
                                        <span>{d.label}</span>
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </Collapsible>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>

            {/* 운영자 관리 — 개발자만 */}
            {isDeveloper && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='운영자 관리'
                  isActive={pathname === '/dashboard/operators'}
                >
                  <Link href='/dashboard/operators'>
                    <Icons.settings className='text-muted-foreground' />
                    <span>운영자 관리</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
