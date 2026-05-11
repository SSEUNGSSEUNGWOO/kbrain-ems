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
import { STAGE_DOMAINS, STAGE_LABEL, type CohortStage } from '@/lib/cohort-stage';

type Cohort = { id: string; name: string; stage: CohortStage };

const STAGE_BADGE_CLASS: Record<CohortStage, string> = {
  recruiting: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  finished: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  unset: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
};

const DOMAINS = [
  { slug: 'students', label: '인원관리', icon: 'teams' as const, color: 'text-blue-500' },
  { slug: 'lessons', label: '수업관리', icon: 'calendar' as const, color: 'text-sky-500' },
  { slug: 'attendance', label: '출결', icon: 'circleCheck' as const, color: 'text-emerald-500' },
  { slug: 'assignments', label: '과제', icon: 'forms' as const, color: 'text-amber-500' },
  { slug: 'surveys', label: '만족도', icon: 'chat' as const, color: 'text-pink-500' },
  { slug: 'completion', label: '수료', icon: 'badgeCheck' as const, color: 'text-violet-500' },
  { slug: 'instructors', label: '강사', icon: 'user2' as const, color: 'text-rose-500' },
  { slug: 'diagnoses', label: '사전·사후 진단', icon: 'checks' as const, color: 'text-cyan-500' },
  { slug: 'reports', label: '결과보고서', icon: 'fileTypeDoc' as const, color: 'text-orange-500' },
  { slug: 'notifications', label: '알림 발송', icon: 'notification' as const, color: 'text-yellow-600' },
  { slug: 'dashboard', label: '누적 통계', icon: 'trendingUp' as const, color: 'text-indigo-500' }
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
  }, [pathname]);

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
            <span className='text-xs font-bold tracking-[0.2em] text-muted-foreground'>
              EMS
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
                              <Link href={`/dashboard/cohorts/${cohort.id}`} className='flex items-center gap-1.5'>
                                <span
                                  className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-tight ${STAGE_BADGE_CLASS[cohort.stage]}`}
                                >
                                  {STAGE_LABEL[cohort.stage]}
                                </span>
                                <span className='truncate'>{cohort.name}</span>
                              </Link>
                            </SidebarMenuSubButton>
                            <CollapsibleTrigger className='hover:bg-accent shrink-0 rounded p-1'>
                              <Icons.chevronRight className='h-3 w-3 transition-transform duration-200 group-data-[state=open]/cohort:rotate-90' />
                            </CollapsibleTrigger>
                          </div>

                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {DOMAINS.filter((d) => STAGE_DOMAINS[cohort.stage].includes(d.slug)).map((d) => {
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

            {/* 지원자 관리 — 글로벌 (기수 무관) */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='지원자 관리'
                isActive={pathname.startsWith('/dashboard/applicants')}
              >
                <Link href='/dashboard/applicants'>
                  <Icons.teams className='text-amber-600 dark:text-amber-400' />
                  <span>지원자 관리</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* 강사풀 — 글로벌 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='강사풀'
                isActive={pathname === '/dashboard/instructors' || pathname.startsWith('/dashboard/instructors/')}
              >
                <Link href='/dashboard/instructors'>
                  <Icons.user2 className='text-rose-600 dark:text-rose-400' />
                  <span>강사풀</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* 평가위원 — 글로벌 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='평가위원'
                isActive={pathname.startsWith('/dashboard/evaluators')}
              >
                <Link href='/dashboard/evaluators'>
                  <Icons.userPen className='text-purple-600 dark:text-purple-400' />
                  <span>평가위원</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* KPI 대시보드 — 글로벌 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='사업 진척률·KPI'
                isActive={pathname.startsWith('/dashboard/kpi-dashboard')}
              >
                <Link href='/dashboard/kpi-dashboard'>
                  <Icons.adjustments className='text-emerald-600 dark:text-emerald-400' />
                  <span>사업 KPI</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* 리스크 등록부 — 글로벌 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='리스크 등록부'
                isActive={pathname.startsWith('/dashboard/risks')}
              >
                <Link href='/dashboard/risks'>
                  <Icons.warning className='text-red-600 dark:text-red-400' />
                  <span>리스크</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* 이슈 보드 — 글로벌 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='이슈 보드'
                isActive={pathname.startsWith('/dashboard/issues')}
              >
                <Link href='/dashboard/issues'>
                  <Icons.alertCircle className='text-orange-600 dark:text-orange-400' />
                  <span>이슈</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

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
