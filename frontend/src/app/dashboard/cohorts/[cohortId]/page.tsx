import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { computeCohortStage, STAGE_DOMAINS } from '@/lib/cohort-stage';
import { RecruitingCard } from './_components/recruiting-card';

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${m}월 ${d}일`;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.getMonth() + 1}. ${date.getDate()}. (${DOW[date.getDay()]})`;
}

type PhaseKey = 'ai-training' | 'special' | 'individual-project' | 'team-project' | 'other';

function classifyPhase(title: string | null): PhaseKey {
  if (!title) return 'other';
  if (title.includes('기술교육')) return 'ai-training';
  if (title.includes('특별교육') || title.includes('리더특강')) return 'special';
  if (title.includes('개인프로젝트')) return 'individual-project';
  if (title.includes('팀프로젝트')) return 'team-project';
  return 'other';
}

const PHASES: { key: PhaseKey; label: string; icon: keyof typeof Icons }[] = [
  { key: 'ai-training', label: 'AI 기술교육', icon: 'page' },
  { key: 'special', label: '특별 세션', icon: 'calendar' },
  { key: 'individual-project', label: '개인프로젝트', icon: 'user' },
  { key: 'team-project', label: '팀프로젝트', icon: 'teams' },
  { key: 'other', label: '기타', icon: 'calendar' }
];

type DomainInfo = {
  slug: string;
  label: string;
  desc: string;
  icon: keyof typeof Icons;
  iconColor: string;
  iconBg: string;
};

const DOMAIN_INFO: Record<string, DomainInfo> = {
  students: { slug: 'students', label: '인원 관리', desc: '교육생 명단 관리', icon: 'teams', iconColor: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-100 dark:bg-blue-900/50' },
  lessons: { slug: 'lessons', label: '수업 관리', desc: '회차·강사·장소', icon: 'calendar', iconColor: 'text-sky-600 dark:text-sky-400', iconBg: 'bg-sky-100 dark:bg-sky-900/50' },
  attendance: { slug: 'attendance', label: '출결', desc: '수업 회차별 출결 현황', icon: 'circleCheck', iconColor: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50' },
  assignments: { slug: 'assignments', label: '과제', desc: '과제 출제, 제출, 채점', icon: 'forms', iconColor: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-900/50' },
  surveys: { slug: 'surveys', label: '만족도', desc: '만족도 설문 발송·결과', icon: 'chat', iconColor: 'text-pink-600 dark:text-pink-400', iconBg: 'bg-pink-100 dark:bg-pink-900/50' },
  instructors: { slug: 'instructors', label: '강사', desc: '강사·강사료 관리', icon: 'user2', iconColor: 'text-rose-600 dark:text-rose-400', iconBg: 'bg-rose-100 dark:bg-rose-900/50' },
  completion: { slug: 'completion', label: '수료', desc: '수료 기준 충족 여부', icon: 'badgeCheck', iconColor: 'text-violet-600 dark:text-violet-400', iconBg: 'bg-violet-100 dark:bg-violet-900/50' },
  reports: { slug: 'reports', label: '결과보고서', desc: '자동 초안 + 검토', icon: 'fileTypeDoc', iconColor: 'text-orange-600 dark:text-orange-400', iconBg: 'bg-orange-100 dark:bg-orange-900/50' }
};

export default async function CohortOverviewPage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const supabase = createAdminClient();

  const [cohortRes, studentRes, sessionRes] = await Promise.all([
    supabase
      .from('cohorts')
      .select(
        'id, name, started_at, ended_at, application_start_at, application_end_at, decided_at, notified_at, delivery_method, recruiting_slug, max_capacity'
      )
      .eq('id', cohortId)
      .limit(1),
    supabase
      .from('students')
      .select('id')
      .eq('cohort_id', cohortId),
    supabase
      .from('sessions')
      .select('id, session_date, title, start_time, end_time')
      .eq('cohort_id', cohortId)
      .order('session_date', { ascending: true })
  ]);

  if (cohortRes.error) throw new Error(cohortRes.error.message);
  if (studentRes.error) throw new Error(studentRes.error.message);
  if (sessionRes.error) throw new Error(sessionRes.error.message);

  const cohort = cohortRes.data?.[0];
  if (!cohort) notFound();

  const stage = computeCohortStage({
    application_start_at: cohort.application_start_at,
    application_end_at: cohort.application_end_at,
    started_at: cohort.started_at,
    ended_at: cohort.ended_at
  });
  const isRecruiting = stage === 'recruiting' && !!cohort.recruiting_slug;

  // 모집중이면 신청자 수도 조회
  let applicantCount = 0;
  if (isRecruiting) {
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId);
    applicantCount = count ?? 0;
  }

  const studentCount = studentRes.data?.length ?? 0;
  const sessionRows = sessionRes.data ?? [];

  // Fetch attendance records for all sessions
  const sessionIds = sessionRows.map((s) => s.id);
  let allRecords: { status: string; session_id: string }[] = [];
  if (sessionIds.length > 0) {
    const { data: records, error: recordError } = await supabase
      .from('attendance_records')
      .select('status, session_id')
      .in('session_id', sessionIds);
    if (recordError) throw new Error(recordError.message);
    allRecords = records ?? [];
  }

  const today = new Date().toISOString().split('T')[0];
  const totalSessions = sessionRows.length;
  const doneSessions = sessionRows.filter((s) => s.session_date < today).length;
  const nextSession = sessionRows.find((s) => s.session_date >= today);
  const isNextToday = nextSession?.session_date === today;

  const enteredRecords = allRecords.filter((r) => r.status !== 'none');
  const totalRecords = enteredRecords.length;
  const presentCount = enteredRecords.filter((r) => r.status !== 'absent').length;
  const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : null;

  // Per-session attendance counts (미입력 'none' 제외)
  const attendanceBySession = new Map<string, { total: number; present: number }>();
  for (const r of allRecords) {
    if (r.status === 'none') continue;
    const entry = attendanceBySession.get(r.session_id) ?? { total: 0, present: 0 };
    entry.total++;
    if (r.status !== 'absent') entry.present++;
    attendanceBySession.set(r.session_id, entry);
  }

  // Group sessions by phase
  const sessionsByPhase = new Map<PhaseKey, typeof sessionRows>();
  for (const s of sessionRows) {
    const phase = classifyPhase(s.title);
    const list = sessionsByPhase.get(phase) ?? [];
    list.push(s);
    sessionsByPhase.set(phase, list);
  }

  const stats = [
    { label: '인원', value: `${studentCount}명`, sub: '등록된 인원' },
    { label: '진행 수업', value: totalSessions > 0 ? `${doneSessions} / ${totalSessions}회` : '-', sub: totalSessions > 0 ? `전체 ${totalSessions}회 중` : '수업 미등록' },
    { label: '평균 출석률', value: attendanceRate != null ? `${attendanceRate}%` : '-', sub: totalRecords > 0 ? `${totalRecords}개 기록` : '출결 미입력' }
  ];

  const visibleDomains = STAGE_DOMAINS[stage]
    .map((slug) => DOMAIN_INFO[slug])
    .filter((d): d is DomainInfo => !!d);

  return (
    <PageContainer
      pageTitle={cohort.name}
      pageDescription={
        cohort.started_at || cohort.ended_at
          ? `${cohort.started_at ? formatDate(cohort.started_at) : '시작 미정'} ~ ${cohort.ended_at ? formatDate(cohort.ended_at) : '종료 미정'}`
          : '교육 기간 미정'
      }
    >
      {/* 일정 정보 — 모집·교육 핵심 일자 한눈에 */}
      <ScheduleInfoCard
        applicationStartAt={cohort.application_start_at}
        applicationEndAt={cohort.application_end_at}
        decidedAt={cohort.decided_at}
        notifiedAt={cohort.notified_at}
        startedAt={cohort.started_at}
        endedAt={cohort.ended_at}
        deliveryMethod={cohort.delivery_method}
        maxCapacity={cohort.max_capacity}
      />

      {/* 모집 단계 — 신청 링크 카드 */}
      {isRecruiting && cohort.recruiting_slug && (
        <RecruitingCard
          slug={cohort.recruiting_slug}
          applicationStartAt={cohort.application_start_at}
          applicationEndAt={cohort.application_end_at}
          applicantCount={applicantCount}
          maxCapacity={cohort.max_capacity}
        />
      )}

      {/* 다음 수업 — 진행/완료 단계 + 예정 수업 있을 때 */}
      {!isRecruiting && nextSession && (
        <Link
          href={`/dashboard/cohorts/${cohortId}/attendance/${nextSession.id}`}
          className={`mb-6 flex items-center justify-between gap-3 rounded-xl border px-5 py-4 transition ${
            isNextToday
              ? 'border-rose-200 bg-gradient-to-br from-rose-50 to-white hover:border-rose-300 hover:shadow-sm dark:border-rose-900 dark:from-rose-950/30 dark:to-background'
              : 'bg-card hover:bg-accent'
          }`}
        >
          <div className='flex min-w-0 items-center gap-3'>
            {isNextToday ? (
              <span className='h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rose-500' />
            ) : (
              <Icons.calendar className='text-muted-foreground h-4 w-4 shrink-0' />
            )}
            <div className='min-w-0'>
              <div className='flex flex-wrap items-baseline gap-x-2 text-sm'>
                <span className='font-semibold'>{isNextToday ? '오늘 수업' : '다음 수업'}</span>
                <span className='text-muted-foreground'>{formatShortDate(nextSession.session_date)}</span>
                {nextSession.start_time && nextSession.end_time && (
                  <span className='text-muted-foreground text-xs'>
                    {nextSession.start_time.slice(0, 5)}~{nextSession.end_time.slice(0, 5)}
                  </span>
                )}
              </div>
              <div className='text-muted-foreground mt-0.5 truncate text-xs'>
                {nextSession.title ?? '제목 없음'}
              </div>
            </div>
          </div>
          <div className={`shrink-0 text-xs font-semibold ${isNextToday ? 'text-rose-600 dark:text-rose-400' : 'text-primary'}`}>
            출결 입력 →
          </div>
        </Link>
      )}

      {/* 주요 지표 — 모집 단계가 아닐 때만 (모집 단계에선 RecruitingCard로 대체) */}
      {!isRecruiting && (
        <div className='mb-8 grid gap-4 sm:grid-cols-3'>
          <div className='rounded-xl border bg-gradient-to-br from-blue-50 to-white px-6 py-5 dark:from-blue-950/30 dark:to-background'>
            <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50'>
              <Icons.teams className='h-4.5 w-4.5 text-blue-600 dark:text-blue-400' />
            </div>
            <div className='text-muted-foreground text-xs font-medium'>{stats[0].label}</div>
            <div className='mt-1 text-3xl font-bold'>{stats[0].value}</div>
            <div className='text-muted-foreground mt-1 text-xs'>{stats[0].sub}</div>
          </div>
          <div className='rounded-xl border bg-gradient-to-br from-violet-50 to-white px-6 py-5 dark:from-violet-950/30 dark:to-background'>
            <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/50'>
              <Icons.calendar className='h-4.5 w-4.5 text-violet-600 dark:text-violet-400' />
            </div>
            <div className='text-muted-foreground text-xs font-medium'>{stats[1].label}</div>
            <div className='mt-1 text-3xl font-bold'>{stats[1].value}</div>
            <div className='text-muted-foreground mt-1 text-xs'>{stats[1].sub}</div>
          </div>
          <div className='rounded-xl border bg-gradient-to-br from-emerald-50 to-white px-6 py-5 dark:from-emerald-950/30 dark:to-background'>
            <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50'>
              <Icons.circleCheck className='h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400' />
            </div>
            <div className='text-muted-foreground text-xs font-medium'>{stats[2].label}</div>
            <div className='mt-1 text-3xl font-bold'>{stats[2].value}</div>
            <div className='text-muted-foreground mt-1 text-xs'>{stats[2].sub}</div>
          </div>
        </div>
      )}

      {/* 교육 일정 — 모집 단계가 아니고 세션 있을 때만 */}
      {!isRecruiting && totalSessions > 0 && (
        <div className='mb-8'>
          <div className='mb-3 flex items-center justify-between'>
            <div className='text-muted-foreground text-sm font-medium'>교육 일정</div>
            <div className='text-muted-foreground text-xs'>{doneSessions} / {totalSessions}회 완료</div>
          </div>
          <div className='grid gap-4'>
            {PHASES.map((phase) => {
              const phaseSessions = sessionsByPhase.get(phase.key);
              if (!phaseSessions || phaseSessions.length === 0) return null;
              const PhaseIcon = Icons[phase.icon];
              const doneInPhase = phaseSessions.filter((s) => s.session_date < today).length;

              return (
                <Card key={phase.key}>
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between'>
                      <CardTitle className='flex items-center gap-2 text-base'>
                        <PhaseIcon className='text-muted-foreground h-4 w-4' />
                        {phase.label}
                      </CardTitle>
                      <Badge variant='outline' className='text-xs font-normal'>
                        {doneInPhase} / {phaseSessions.length}회
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className='pt-0'>
                    <div className='divide-y'>
                      {phaseSessions.map((s) => {
                        const status = s.session_date === today ? 'today' : s.session_date < today ? 'done' : 'upcoming';
                        const att = attendanceBySession.get(s.id);
                        const timeLabel = s.start_time && s.end_time
                          ? `${s.start_time.slice(0, 5)}~${s.end_time.slice(0, 5)}`
                          : null;

                        return (
                          <div
                            key={s.id}
                            className={`flex items-center gap-3 py-2.5 ${status === 'today' ? '-mx-2 rounded bg-blue-50 px-2 dark:bg-blue-950/20' : ''}`}
                          >
                            {status === 'done' && <Icons.circleCheck className='h-4 w-4 shrink-0 text-green-500' />}
                            {status === 'today' && <span className='h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-blue-500' />}
                            {status === 'upcoming' && <div className='border-muted-foreground/30 h-4 w-4 shrink-0 rounded-full border-2' />}

                            <span className='text-muted-foreground w-24 shrink-0 text-xs'>
                              {formatShortDate(s.session_date)}
                            </span>

                            <span className={`min-w-0 flex-1 truncate text-sm ${status === 'upcoming' ? 'text-muted-foreground' : ''}`}>
                              {s.title ?? '제목 없음'}
                            </span>

                            {timeLabel && (
                              <span className='text-muted-foreground hidden shrink-0 text-xs sm:inline'>
                                {timeLabel}
                              </span>
                            )}

                            {att && (
                              <Badge
                                variant='outline'
                                className={`shrink-0 text-xs font-normal ${
                                  att.present === att.total
                                    ? 'border-green-200 text-green-700 dark:border-green-900 dark:text-green-400'
                                    : ''
                                }`}
                              >
                                {att.present}/{att.total}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 도메인 바로가기 — stage별 노출 */}
      <div className='text-muted-foreground mb-3 text-sm font-medium'>바로가기</div>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {visibleDomains.map((d) => {
          const DomainIcon = Icons[d.icon];
          return (
            <Link
              key={d.slug}
              href={`/dashboard/cohorts/${cohortId}/${d.slug}`}
              className='hover:bg-accent group block rounded-xl border p-4 transition-colors'
            >
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${d.iconBg}`}>
                <DomainIcon className={`h-4.5 w-4.5 ${d.iconColor}`} />
              </div>
              <div className='font-semibold'>{d.label}</div>
              <div className='text-muted-foreground mt-1 text-xs'>{d.desc}</div>
            </Link>
          );
        })}
      </div>
    </PageContainer>
  );
}

function ScheduleInfoCard({
  applicationStartAt,
  applicationEndAt,
  decidedAt,
  notifiedAt,
  startedAt,
  endedAt,
  deliveryMethod,
  maxCapacity
}: {
  applicationStartAt: string | null;
  applicationEndAt: string | null;
  decidedAt: string | null;
  notifiedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  deliveryMethod: string | null;
  maxCapacity: number | null;
}) {
  const fmt = (d: string | null) => (d ? formatShortDate(d) : '—');
  const fmtRange = (a: string | null, b: string | null) => {
    if (!a && !b) return '—';
    if (a && b) return `${formatShortDate(a)} ~ ${formatShortDate(b)}`;
    return formatShortDate(a ?? b!);
  };
  const items: { label: string; value: string; accent?: string }[] = [
    { label: '신청기간', value: fmtRange(applicationStartAt, applicationEndAt), accent: 'orange' },
    { label: '선발일', value: fmt(decidedAt), accent: 'amber' },
    { label: '선발통보', value: fmt(notifiedAt), accent: 'amber' },
    { label: '교육기간', value: fmtRange(startedAt, endedAt), accent: 'blue' },
    { label: '방법', value: deliveryMethod ?? '—', accent: 'violet' },
    { label: '인원', value: maxCapacity ? `${maxCapacity}명` : '—', accent: 'slate' }
  ];
  return (
    <div className='mb-6 rounded-xl border bg-card px-5 py-4 shadow-sm'>
      <div className='mb-3 flex items-center gap-2'>
        <Icons.calendar className='text-muted-foreground h-4 w-4' />
        <span className='text-sm font-semibold'>일정 정보</span>
      </div>
      <dl className='grid gap-x-6 gap-y-3 sm:grid-cols-3'>
        {items.map((it) => (
          <div key={it.label} className='flex items-baseline gap-2'>
            <dt className='text-muted-foreground w-16 shrink-0 text-xs font-medium'>{it.label}</dt>
            <dd className='font-mono text-sm tabular-nums'>{it.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
