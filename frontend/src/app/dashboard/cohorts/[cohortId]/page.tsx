import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { cohorts, students, sessions, attendanceRecords } from '@/lib/db/schema';
import { eq, count, asc, inArray } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';

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
  { key: 'other', label: '기타', icon: 'calendar' },
];

const DOMAINS = [
  { slug: 'students', label: '인원 관리', desc: '교육생 명단 관리', icon: 'teams' as const, iconColor: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-100 dark:bg-blue-900/50' },
  { slug: 'attendance', label: '출결', desc: '수업 회차별 출결 현황', icon: 'circleCheck' as const, iconColor: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50' },
  { slug: 'assignments', label: '과제', desc: '과제 출제, 제출, 채점', icon: 'forms' as const, iconColor: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-900/50' },
  { slug: 'completion', label: '수료', desc: '수료 기준 충족 여부', icon: 'badgeCheck' as const, iconColor: 'text-violet-600 dark:text-violet-400', iconBg: 'bg-violet-100 dark:bg-violet-900/50' }
] as const;

export default async function CohortOverviewPage({
  params
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;

  const [cohortRows, studentCountRows, sessionRows] = await Promise.all([
    db
      .select({
        id: cohorts.id,
        name: cohorts.name,
        started_at: cohorts.startedAt,
        ended_at: cohorts.endedAt
      })
      .from(cohorts)
      .where(eq(cohorts.id, cohortId))
      .limit(1),
    db
      .select({ count: count() })
      .from(students)
      .where(eq(students.cohortId, cohortId)),
    db
      .select({
        id: sessions.id,
        session_date: sessions.sessionDate,
        title: sessions.title,
        start_time: sessions.startTime,
        end_time: sessions.endTime
      })
      .from(sessions)
      .where(eq(sessions.cohortId, cohortId))
      .orderBy(asc(sessions.sessionDate))
  ]);

  const cohort = cohortRows[0];
  if (!cohort) notFound();

  const studentCount = studentCountRows[0]?.count ?? 0;

  // Fetch attendance records for all sessions
  const sessionIds = sessionRows.map((s) => s.id);
  let allRecords: { status: string; session_id: string }[] = [];
  if (sessionIds.length > 0) {
    allRecords = await db
      .select({
        status: attendanceRecords.status,
        session_id: attendanceRecords.sessionId
      })
      .from(attendanceRecords)
      .where(
        sessionIds.length === 1
          ? eq(attendanceRecords.sessionId, sessionIds[0])
          : inArray(attendanceRecords.sessionId, sessionIds)
      );
  }

  const today = new Date().toISOString().split('T')[0];
  const totalSessions = sessionRows.length;
  const doneSessions = sessionRows.filter((s) => s.session_date < today).length;

  const totalRecords = allRecords.length;
  const presentCount = allRecords.filter((r) => r.status !== 'absent').length;
  const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : null;

  // Per-session attendance counts
  const attendanceBySession = new Map<string, { total: number; present: number }>();
  for (const r of allRecords) {
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

  return (
    <PageContainer
      pageTitle={cohort.name}
      pageDescription={
        cohort.started_at || cohort.ended_at
          ? `${cohort.started_at ? formatDate(cohort.started_at) : '시작 미정'} ~ ${cohort.ended_at ? formatDate(cohort.ended_at) : '종료 미정'}`
          : '교육 기간 미정'
      }
    >
      {/* 주요 지표 */}
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

      {/* 교육 일정 */}
      {totalSessions > 0 && (
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

      {/* 도메인 바로가기 */}
      <div className='text-muted-foreground mb-3 text-sm font-medium'>바로가기</div>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {DOMAINS.map((d) => {
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
