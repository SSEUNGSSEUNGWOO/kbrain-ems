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
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { Icons } from '../icons';
import { Logo } from '../brand/logo';
import { STAGE_DOMAINS, STAGE_LABEL, type CohortStage } from '@/lib/cohort-stage';

type Cohort = { id: string; name: string; category: string | null; stage: CohortStage };

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'champion', label: '1. AI 챔피언' },
  { key: 'general', label: '2. 일반교육' },
  { key: 'special', label: '3. 특화교육' },
  { key: 'experts', label: '4. 전문인재' }
];

const STAGE_BADGE_CLASS: Record<CohortStage, string> = {
  recruiting: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  selecting: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  notifying: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  onboarding: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  finished: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  preparing: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  unset: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
};

const DOMAINS = [
  { slug: 'applications', label: '신청·응답', icon: 'forms' as const, color: 'text-teal-500' },
  { slug: 'students', label: '인원관리', icon: 'teams' as const, color: 'text-blue-500' },
  { slug: 'lessons', label: '수업관리', icon: 'calendar' as const, color: 'text-sky-500' },
  { slug: 'attendance', label: '출결', icon: 'circleCheck' as const, color: 'text-emerald-500' },
  { slug: 'assignments', label: '과제', icon: 'forms' as const, color: 'text-amber-500' },
  { slug: 'surveys', label: '만족도', icon: 'chat' as const, color: 'text-pink-500' },
  { slug: 'completion', label: '수료', icon: 'badgeCheck' as const, color: 'text-violet-500' },
  { slug: 'instructors', label: '강사', icon: 'user2' as const, color: 'text-rose-500' },
  { slug: 'diagnoses', label: '사전·사후 진단', icon: 'checks' as const, color: 'text-cyan-500' },
  { slug: 'pretraining', label: '사전 세팅 체크', icon: 'circleCheck' as const, color: 'text-lime-500' },
  { slug: 'reports', label: '결과보고서', icon: 'fileTypeDoc' as const, color: 'text-orange-500' },
  { slug: 'notifications', label: '알림 발송', icon: 'notification' as const, color: 'text-yellow-600' },
  { slug: 'dashboard', label: '누적 통계', icon: 'trendingUp' as const, color: 'text-indigo-500' }
] as const;

export default function AppSidebar() {
  const pathname = usePathname();
  const { isDeveloper } = useAuth();

  const activeCohortId = pathname.match(/^\/dashboard\/cohorts\/([^/]+)/)?.[1] ?? null;
  const isInsideCohorts = pathname.startsWith('/dashboard/cohorts');

  // 한 번에 하나의 cohort만 펼침 (accordion). 현재 active cohort 자동 펼침.
  const [openCohortId, setOpenCohortId] = React.useState<string | null>(activeCohortId);
  React.useEffect(() => {
    if (activeCohortId) setOpenCohortId(activeCohortId);
  }, [activeCohortId]);

  // 페이지 전환마다 fetch 안 하도록 TanStack Query로 캐시. staleTime 안에선 메모리 사용.
  const { data: cohorts = [] } = useQuery<Cohort[]>({
    queryKey: ['sidebar', 'cohorts-list'],
    queryFn: () => fetch('/api/cohorts-list').then((r) => r.json()),
    staleTime: 60_000
  });

  const { data: pendingDispatchCount = 0 } = useQuery<number>({
    queryKey: ['sidebar', 'notifications-pending-count'],
    queryFn: () =>
      fetch('/api/notifications-pending-count')
        .then((r) => r.json())
        .then((d) => d?.count ?? 0),
    staleTime: 30_000
  });

  // 카테고리별로 그룹화
  const cohortsByCategory = React.useMemo(() => {
    const map = new Map<string, Cohort[]>();
    for (const cat of CATEGORIES) map.set(cat.key, []);
    const uncategorized: Cohort[] = [];
    for (const c of cohorts) {
      if (c.category && map.has(c.category)) map.get(c.category)!.push(c);
      else uncategorized.push(c);
    }
    return { map, uncategorized };
  }, [cohorts]);

  // 활성 cohort가 속한 카테고리 자동 펼침
  const activeCohortCategory = React.useMemo(() => {
    if (!activeCohortId) return null;
    return cohorts.find((c) => c.id === activeCohortId)?.category ?? null;
  }, [activeCohortId, cohorts]);

  return (
    <Sidebar collapsible='icon' className='print:hidden'>
      <SidebarHeader className='border-sidebar-border border-b p-0'>
        <Link
          href='/dashboard/overview'
          className='relative flex flex-col items-start gap-2 overflow-hidden px-5 py-5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-3'
        >
          <div className='relative flex items-center gap-2 group-data-[collapsible=icon]:hidden'>
            <Image
              src='/brand/korus-symbol-white.svg'
              alt='Korus'
              width={28}
              height={28}
              className='h-7 w-7'
              priority
            />
            <span className='text-xl font-bold tracking-[-0.03em] text-sidebar-foreground'>
              Korus
            </span>
            <span className='text-sidebar-foreground/30 text-lg font-light'>|</span>
            <Image
              src='/brand/k-brain-mark.png'
              alt='K-Brain'
              width={780}
              height={832}
              className='h-5 w-auto opacity-90 brightness-0 invert'
              priority
            />
            <span className='text-xl font-bold tracking-[-0.03em] text-sidebar-foreground'>
              K-Brain
            </span>
          </div>
          <Image
            src='/brand/korus-symbol-white.svg'
            alt='Korus'
            width={28}
            height={28}
            className='relative hidden shrink-0 group-data-[collapsible=icon]:block'
          />
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

            {/* 캘린더 — 모든 cohort 일정 통합 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='캘린더'
                isActive={pathname.startsWith('/dashboard/calendar')}
              >
                <Link href='/dashboard/calendar'>
                  <Icons.calendar className='text-pink-600 dark:text-pink-400' />
                  <span>캘린더</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* 알림 발송 inbox — 글로벌 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='알림 발송'
                isActive={pathname === '/dashboard/notifications'}
              >
                <Link href='/dashboard/notifications'>
                  <Icons.notification className='text-yellow-600 dark:text-yellow-400' />
                  <span>알림 발송 (beta)</span>
                  {pendingDispatchCount > 0 && (
                    <span className='ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:h-3.5 group-data-[collapsible=icon]:min-w-3.5'>
                      {pendingDispatchCount}
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* 운영관리 — 전체 회차 한눈에 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='운영관리'
                isActive={pathname.startsWith('/dashboard/operations')}
              >
                <Link href='/dashboard/operations'>
                  <Icons.adjustments className='text-emerald-600 dark:text-emerald-400' />
                  <span>운영관리</span>
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
                  <CollapsibleTrigger className='hover:bg-sidebar-accent shrink-0 rounded p-1 group-data-[collapsible=icon]:hidden'>
                    <Icons.chevronRight className='h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                  </CollapsibleTrigger>
                </div>

                <CollapsibleContent className='overflow-hidden collapsible-anim'>
                  <SidebarMenuSub className='mr-0 pr-0'>
                    {cohorts.length === 0 && (
                      <SidebarMenuSubItem>
                        <span className='text-muted-foreground px-2 py-1 text-xs'>등록된 기수 없음</span>
                      </SidebarMenuSubItem>
                    )}
                    {CATEGORIES.map((cat) => {
                      const items = cohortsByCategory.map.get(cat.key) ?? [];
                      if (items.length === 0) return null;
                      const isActiveCat = activeCohortCategory === cat.key;
                      return (
                        <SidebarMenuSubItem key={cat.key}>
                          <Collapsible
                            defaultOpen={isActiveCat}
                            className='group/cat w-full'
                          >
                            <CollapsibleTrigger className='hover:bg-sidebar-accent flex w-full items-center justify-between rounded px-2 py-1.5 text-sm font-semibold text-sidebar-foreground'>
                              <span>{cat.label}</span>
                              <Icons.chevronRight className='h-3 w-3 transition-transform duration-200 group-data-[state=open]/cat:rotate-90' />
                            </CollapsibleTrigger>
                            <CollapsibleContent className='overflow-hidden collapsible-anim'>
                              <SidebarMenuSub className='mr-0 pr-0'>
                                {items.map((cohort) => (
                                  <SidebarMenuSubItem key={cohort.id}>
                                    <Collapsible
                                      open={openCohortId === cohort.id}
                                      onOpenChange={(o) => setOpenCohortId(o ? cohort.id : null)}
                                      className='group/cohort w-full'
                                    >
                                      <div className='flex w-full items-center'>
                                        <SidebarMenuSubButton
                                          asChild
                                          className='flex-1 min-w-0'
                                          isActive={pathname === `/dashboard/cohorts/${cohort.id}`}
                                        >
                                          <Link href={`/dashboard/cohorts/${cohort.id}`} className='flex min-w-0 items-center gap-1.5'>
                                            <span
                                              className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-tight ${STAGE_BADGE_CLASS[cohort.stage]}`}
                                            >
                                              {STAGE_LABEL[cohort.stage]}
                                            </span>
                                            <span className='truncate'>{cohort.name}</span>
                                          </Link>
                                        </SidebarMenuSubButton>
                                        <CollapsibleTrigger className='hover:bg-sidebar-accent shrink-0 rounded p-1'>
                                          <Icons.chevronRight className='h-3 w-3 transition-transform duration-200 group-data-[state=open]/cohort:rotate-90' />
                                        </CollapsibleTrigger>
                                      </div>

                                      <CollapsibleContent className='overflow-hidden collapsible-anim'>
                                        <SidebarMenuSub className='mr-0 pr-0'>
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
                          </Collapsible>
                        </SidebarMenuSubItem>
                      );
                    })}
                    {cohortsByCategory.uncategorized.length > 0 && (
                      <SidebarMenuSubItem>
                        <Collapsible className='group/cat w-full'>
                          <CollapsibleTrigger className='hover:bg-sidebar-accent flex w-full items-center justify-between rounded px-2 py-1.5 text-sm font-semibold text-sidebar-foreground'>
                            <span>미분류</span>
                            <Icons.chevronRight className='h-3 w-3 transition-transform duration-200 group-data-[state=open]/cat:rotate-90' />
                          </CollapsibleTrigger>
                          <CollapsibleContent className='overflow-hidden collapsible-anim'>
                            <SidebarMenuSub className='mr-0 pr-0'>
                              {cohortsByCategory.uncategorized.map((cohort) => (
                                <SidebarMenuSubItem key={cohort.id}>
                                  <SidebarMenuSubButton asChild className='min-w-0' isActive={pathname === `/dashboard/cohorts/${cohort.id}`}>
                                    <Link href={`/dashboard/cohorts/${cohort.id}`} className='flex min-w-0 items-center gap-1.5'>
                                      <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-tight ${STAGE_BADGE_CLASS[cohort.stage]}`}>
                                        {STAGE_LABEL[cohort.stage]}
                                      </span>
                                      <span className='truncate'>{cohort.name}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </Collapsible>
                      </SidebarMenuSubItem>
                    )}
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

            {/* 사전학습 명단 — 글로벌 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='사전학습 명단'
                isActive={pathname.startsWith('/dashboard/lms-completions')}
              >
                <Link href='/dashboard/lms-completions'>
                  <Icons.checks className='text-teal-600 dark:text-teal-400' />
                  <span>사전학습 명단</span>
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

            {/* 보조강사 배정 — 글로벌 */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip='보조강사 배정'
                isActive={pathname.startsWith('/dashboard/assistants')}
              >
                <Link href='/dashboard/assistants'>
                  <Icons.user2 className='text-pink-600 dark:text-pink-400' />
                  <span>보조강사 배정</span>
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

            {/* 활동 로그 — 개발자만 */}
            {isDeveloper && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='활동 로그'
                  isActive={pathname.startsWith('/dashboard/activity-logs')}
                >
                  <Link href='/dashboard/activity-logs'>
                    <Icons.clock className='text-muted-foreground' />
                    <span>활동 로그</span>
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
