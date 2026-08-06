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

// Korus refined 사이드바 톤 (dark navy) 에 어울리는 stage 8색 — dark variant 만 사용.
// mono 9.5px / radius 5px / min-w 34px 는 refined 그대로 유지.
const BADGE_BASE =
  'font-mono text-[9.5px] font-semibold tracking-[0.02em] px-1.5 py-[2px] rounded-[5px] min-w-[34px] text-center';

const STAGE_BADGE_CLASS: Record<CohortStage, string> = {
  recruiting: `${BADGE_BASE} bg-orange-950/50 text-orange-300`,
  selecting: `${BADGE_BASE} bg-rose-950/50 text-rose-300`,
  notifying: `${BADGE_BASE} bg-cyan-950/50 text-cyan-300`,
  preparing: `${BADGE_BASE} bg-violet-950/50 text-violet-300`,
  onboarding: `${BADGE_BASE} bg-emerald-950/50 text-emerald-300`,
  active: `${BADGE_BASE} bg-blue-900/60 text-blue-200`,
  finished: `${BADGE_BASE} bg-slate-800 text-slate-400`,
  unset: `${BADGE_BASE} bg-amber-950/50 text-amber-300`
};

// 단색 라인 아이콘 — color 는 currentColor 통일. active 시에만 primary tint.
const DOMAINS = [
  { slug: 'applications', label: '신청·응답', icon: 'forms' as const },
  { slug: 'students', label: '교육생정보', icon: 'teams' as const },
  { slug: 'lessons', label: '수업관리', icon: 'calendar' as const },
  { slug: 'attendance', label: '출결', icon: 'circleCheck' as const },
  { slug: 'assignments', label: '과제', icon: 'forms' as const },
  { slug: 'surveys', label: '만족도', icon: 'chat' as const },
  { slug: 'completion', label: '수료', icon: 'badgeCheck' as const },
  { slug: 'instructors', label: '강사', icon: 'user2' as const },
  { slug: 'diagnoses', label: '사전·사후 진단', icon: 'checks' as const },
  { slug: 'pretraining', label: '사전 세팅 체크', icon: 'circleCheck' as const },
  { slug: 'reports', label: '결과보고서', icon: 'fileTypeDoc' as const },
  { slug: 'notifications', label: '알림 발송', icon: 'notification' as const },
  { slug: 'dashboard', label: '누적 통계', icon: 'trendingUp' as const }
] as const;

// 보조강사가 볼 수 있는 cohort 하위 도메인 — 나머지는 숨김.
const ASSISTANT_DOMAIN_SLUGS: readonly string[] = [
  'students',
  'lessons',
  'attendance',
  'surveys',
  'diagnoses'
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { isDeveloper, isAssistant } = useAuth();

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
          href={isAssistant ? '/dashboard/cohorts' : '/dashboard/overview'}
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
            <span className='text-xl font-bold tracking-[-0.03em] text-white'>Korus</span>
            <span className='text-lg font-light text-white/30'>|</span>
            <Image
              src='/brand/k-brain-mark.png'
              alt='K-Brain'
              width={780}
              height={832}
              className='h-[18px] w-auto opacity-90 brightness-0 invert'
              priority
            />
            <span className='text-[17px] font-semibold tracking-tight text-white'>K-Brain</span>
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
          <SidebarGroupLabel className='font-mono text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[#6E80A0]'>
            메뉴
          </SidebarGroupLabel>
          <SidebarMenu>
            {/* 대시보드 */}
            {!isAssistant && (
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
            )}

            {/* 캘린더 — 모든 cohort 일정 통합 */}
            {!isAssistant && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='캘린더'
                  isActive={pathname.startsWith('/dashboard/calendar')}
                >
                  <Link href='/dashboard/calendar'>
                    <Icons.calendar />
                    <span>캘린더</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* 알림 발송 inbox — 글로벌 */}
            {!isAssistant && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='알림 발송'
                  isActive={pathname === '/dashboard/notifications'}
                >
                  <Link href='/dashboard/notifications'>
                    <Icons.notification />
                    <span>알림 발송 (beta)</span>
                    {pendingDispatchCount > 0 && (
                      <span className='ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:h-3.5 group-data-[collapsible=icon]:min-w-3.5'>
                        {pendingDispatchCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* 운영관리 — 전체 회차 한눈에 */}
            {!isAssistant && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='운영관리'
                  isActive={pathname.startsWith('/dashboard/operations')}
                >
                  <Link href='/dashboard/operations'>
                    <Icons.adjustments />
                    <span>운영관리</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* 기수 목록 — 펼치면 기수 트리 표시 */}
            <Collapsible asChild defaultOpen={isInsideCohorts} className='group/collapsible'>
              <SidebarMenuItem>
                <div className='flex w-full items-center'>
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
                  <CollapsibleTrigger className='hover:bg-sidebar-accent shrink-0 rounded p-1 group-data-[collapsible=icon]:hidden'>
                    <Icons.chevronRight className='h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                  </CollapsibleTrigger>
                </div>

                <CollapsibleContent className='overflow-hidden collapsible-anim'>
                  <SidebarMenuSub className='mr-0 pr-0'>
                    {cohorts.length === 0 && (
                      <SidebarMenuSubItem>
                        <span className='text-muted-foreground px-2 py-1 text-xs'>
                          등록된 기수 없음
                        </span>
                      </SidebarMenuSubItem>
                    )}
                    {CATEGORIES.map((cat) => {
                      const items = cohortsByCategory.map.get(cat.key) ?? [];
                      if (items.length === 0) return null;
                      const isActiveCat = activeCohortCategory === cat.key;
                      return (
                        <SidebarMenuSubItem key={cat.key}>
                          <Collapsible defaultOpen={isActiveCat} className='group/cat w-full'>
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
                                          <Link
                                            href={`/dashboard/cohorts/${cohort.id}`}
                                            className='flex min-w-0 items-center gap-1.5'
                                          >
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
                                          {DOMAINS.filter(
                                            (d) =>
                                              STAGE_DOMAINS[cohort.stage].includes(d.slug) &&
                                              (!isAssistant ||
                                                ASSISTANT_DOMAIN_SLUGS.includes(d.slug))
                                          ).map((d) => {
                                            const DomainIcon = Icons[d.icon];
                                            return (
                                              <SidebarMenuSubItem key={d.slug}>
                                                <SidebarMenuSubButton
                                                  asChild
                                                  isActive={pathname.startsWith(
                                                    `/dashboard/cohorts/${cohort.id}/${d.slug}`
                                                  )}
                                                >
                                                  <Link
                                                    href={`/dashboard/cohorts/${cohort.id}/${d.slug}`}
                                                  >
                                                    <DomainIcon className='h-3.5 w-3.5 shrink-0' />
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
                                  <SidebarMenuSubButton
                                    asChild
                                    className='min-w-0'
                                    isActive={pathname === `/dashboard/cohorts/${cohort.id}`}
                                  >
                                    <Link
                                      href={`/dashboard/cohorts/${cohort.id}`}
                                      className='flex min-w-0 items-center gap-1.5'
                                    >
                                      <span
                                        className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-tight ${STAGE_BADGE_CLASS[cohort.stage]}`}
                                      >
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
            {!isAssistant && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='지원자 관리'
                  isActive={pathname.startsWith('/dashboard/applicants')}
                >
                  <Link href='/dashboard/applicants'>
                    <Icons.teams />
                    <span>지원자 관리</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* 실전평가 — 글로벌 (CBT) */}
            {!isAssistant && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='실전평가'
                  isActive={pathname.startsWith('/dashboard/exams')}
                >
                  <Link href='/dashboard/exams'>
                    <Icons.forms />
                    <span>실전평가</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* 사전학습 명단 — 글로벌 */}
            {!isAssistant && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='사전학습 명단'
                  isActive={pathname.startsWith('/dashboard/lms-completions')}
                >
                  <Link href='/dashboard/lms-completions'>
                    <Icons.checks />
                    <span>사전학습 명단</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* 자료 다운로드 — 글로벌 */}
            {!isAssistant && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='자료 다운로드'
                  isActive={pathname.startsWith('/dashboard/downloads')}
                >
                  <Link href='/dashboard/downloads'>
                    <Icons.download />
                    <span>자료 다운로드</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* 강사풀 — 글로벌 */}
            {!isAssistant && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='강사풀'
                  isActive={
                    pathname === '/dashboard/instructors' ||
                    pathname.startsWith('/dashboard/instructors/')
                  }
                >
                  <Link href='/dashboard/instructors'>
                    <Icons.user2 />
                    <span>강사풀</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* 보조강사 배정 — 글로벌 */}
            {!isAssistant && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='보조강사 배정'
                  isActive={pathname.startsWith('/dashboard/assistants')}
                >
                  <Link href='/dashboard/assistants'>
                    <Icons.user2 />
                    <span>보조강사 배정</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            {/* 운영자 관리 — 개발자만 */}
            {isDeveloper && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip='운영자 관리'
                  isActive={pathname === '/dashboard/operators'}
                >
                  <Link href='/dashboard/operators'>
                    <Icons.settings />
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
                    <Icons.clock />
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
