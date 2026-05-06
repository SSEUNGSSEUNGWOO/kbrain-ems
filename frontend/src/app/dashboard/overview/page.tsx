import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { cohorts, students, sessions, attendanceRecords, organizations } from '@/lib/db/schema';
import { eq, asc, sql, ne, and, lt } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { classifyOrganization, ORGANIZATION_CATEGORY_LABEL, type OrganizationCategory } from '@/lib/organization-category';
import { CategoryPieChart } from './_components/category-pie-chart';

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.getMonth() + 1}. ${date.getDate()}. (${DOW[date.getDay()]})`;
}

export default async function OverviewPage() {
  const today = new Date().toISOString().split('T')[0];

  // Fetch all cohorts
  const allCohorts = await db
    .select({
      id: cohorts.id,
      name: cohorts.name,
      startedAt: cohorts.startedAt,
      endedAt: cohorts.endedAt
    })
    .from(cohorts)
    .orderBy(asc(cohorts.name));

  // Fetch per-cohort student counts
  const studentCounts = await db
    .select({
      cohortId: students.cohortId,
      count: sql<number>`count(*)::int`
    })
    .from(students)
    .groupBy(students.cohortId);
  const studentCountMap = new Map(studentCounts.map((r) => [r.cohortId, r.count]));

  // Fetch all sessions with cohort info
  const allSessions = await db
    .select({
      id: sessions.id,
      cohortId: sessions.cohortId,
      sessionDate: sessions.sessionDate,
      title: sessions.title
    })
    .from(sessions)
    .orderBy(asc(sessions.sessionDate));

  // Fetch per-session attendance counts (sessions that have any records)
  const attendanceCounts = await db
    .select({
      sessionId: attendanceRecords.sessionId,
      total: sql<number>`count(*)::int`,
      present: sql<number>`count(*) filter (where ${attendanceRecords.status} != 'absent')::int`
    })
    .from(attendanceRecords)
    .groupBy(attendanceRecords.sessionId);
  const attendanceMap = new Map(attendanceCounts.map((r) => [r.sessionId, r]));

  // Build per-cohort data
  const cohortData = allCohorts.map((c) => {
    const cohortSessions = allSessions.filter((s) => s.cohortId === c.id);
    const totalSessions = cohortSessions.length;
    const doneSessions = cohortSessions.filter((s) => s.sessionDate < today).length;
    const nextSession = cohortSessions.find((s) => s.sessionDate >= today);
    const studentCount = studentCountMap.get(c.id) ?? 0;

    // Attendance rate for this cohort
    let totalRecords = 0;
    let presentRecords = 0;
    for (const s of cohortSessions) {
      const att = attendanceMap.get(s.id);
      if (att) {
        totalRecords += att.total;
        presentRecords += att.present;
      }
    }
    const attendanceRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : null;

    // Past sessions without attendance records
    const missingAttendance = cohortSessions.filter(
      (s) => s.sessionDate < today && !attendanceMap.has(s.id)
    );

    const progressPct = totalSessions > 0 ? Math.round((doneSessions / totalSessions) * 100) : 0;

    return {
      ...c,
      studentCount,
      totalSessions,
      doneSessions,
      progressPct,
      nextSession,
      attendanceRate,
      missingAttendance
    };
  });

  // Global stats
  const totalStudents = studentCounts.reduce((sum, r) => sum + r.count, 0);
  const activeCohorts = cohortData.filter((c) => c.totalSessions > 0).length;

  // Global next session
  const globalNext = allSessions.find((s) => s.sessionDate >= today);
  const globalNextCohort = globalNext
    ? allCohorts.find((c) => c.id === globalNext.cohortId)
    : null;

  // All missing attendance across cohorts
  const allMissing = cohortData.flatMap((c) =>
    c.missingAttendance.map((s) => ({
      cohortId: c.id,
      cohortName: c.name,
      sessionId: s.id,
      sessionDate: s.sessionDate,
      title: s.title
    }))
  );

  // Global attendance rate
  let globalTotal = 0;
  let globalPresent = 0;
  for (const att of attendanceCounts) {
    globalTotal += att.total;
    globalPresent += att.present;
  }
  const globalRate = globalTotal > 0 ? Math.round((globalPresent / globalTotal) * 100) : null;

  // 소속 카테고리별 집계
  const allStudentOrgs = await db
    .select({ orgName: organizations.name })
    .from(students)
    .leftJoin(organizations, eq(students.organizationId, organizations.id));

  const CATEGORY_COLORS: Record<OrganizationCategory, string> = {
    central: '#3b82f6',
    basic_local: '#10b981',
    metro_local: '#06b6d4',
    public: '#f59e0b',
    education: '#8b5cf6',
    unknown: '#94a3b8'
  };

  const categoryCounts = allStudentOrgs.reduce((acc, r) => {
    const cat = classifyOrganization(r.orgName);
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {} as Record<OrganizationCategory, number>);

  const categoryChartData = (Object.keys(ORGANIZATION_CATEGORY_LABEL) as OrganizationCategory[]).map((key) => ({
    name: ORGANIZATION_CATEGORY_LABEL[key],
    value: categoryCounts[key] ?? 0,
    color: CATEGORY_COLORS[key]
  }));

  return (
    <PageContainer
      pageTitle='대시보드'
      pageDescription='교육과정 운영 현황'
    >
      {/* 상단 통계 카드 */}
      <div className='mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <div className='rounded-xl border bg-gradient-to-br from-blue-50 to-white px-6 py-5 dark:from-blue-950/30 dark:to-background'>
          <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50'>
            <Icons.teams className='h-4.5 w-4.5 text-blue-600 dark:text-blue-400' />
          </div>
          <div className='text-muted-foreground text-xs font-medium'>전체 교육생</div>
          <div className='mt-1 text-3xl font-bold'>{totalStudents}명</div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {allCohorts.map((c) => `${c.name.replace('전문인재 ', '')} ${studentCountMap.get(c.id) ?? 0}명`).join(' · ')}
          </div>
        </div>
        <div className='rounded-xl border bg-gradient-to-br from-violet-50 to-white px-6 py-5 dark:from-violet-950/30 dark:to-background'>
          <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/50'>
            <Icons.galleryVerticalEnd className='h-4.5 w-4.5 text-violet-600 dark:text-violet-400' />
          </div>
          <div className='text-muted-foreground text-xs font-medium'>진행 중 과정</div>
          <div className='mt-1 text-3xl font-bold'>{activeCohorts}개</div>
          <div className='text-muted-foreground mt-1 text-xs'>전체 {allCohorts.length}개 과정</div>
        </div>
        <div className='rounded-xl border bg-gradient-to-br from-emerald-50 to-white px-6 py-5 dark:from-emerald-950/30 dark:to-background'>
          <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50'>
            <Icons.circleCheck className='h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400' />
          </div>
          <div className='text-muted-foreground text-xs font-medium'>전체 출석률</div>
          <div className='mt-1 text-3xl font-bold'>{globalRate != null ? `${globalRate}%` : '-'}</div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {globalTotal > 0 ? `${globalPresent}/${globalTotal}건 출석` : '출결 미입력'}
          </div>
        </div>
        <div className='rounded-xl border bg-gradient-to-br from-amber-50 to-white px-6 py-5 dark:from-amber-950/30 dark:to-background'>
          <div className='mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50'>
            <Icons.calendar className='h-4.5 w-4.5 text-amber-600 dark:text-amber-400' />
          </div>
          <div className='text-muted-foreground text-xs font-medium'>다음 수업</div>
          <div className='mt-1 text-2xl font-bold'>
            {globalNext ? formatShortDate(globalNext.sessionDate) : '-'}
          </div>
          <div className='text-muted-foreground mt-1 truncate text-xs'>
            {globalNext && globalNextCohort
              ? `${globalNextCohort.name.replace('전문인재 ', '')} · ${globalNext.title ?? ''}`
              : '예정된 수업 없음'}
          </div>
        </div>
      </div>

      {/* 출결 미입력 알림 */}
      {allMissing.length > 0 && (
        <div className='mb-8'>
          <Card className='border-amber-200 dark:border-amber-900'>
            <CardHeader className='pb-3'>
              <CardTitle className='flex items-center gap-2 text-base text-amber-600 dark:text-amber-400'>
                <Icons.warning className='h-4 w-4' />
                출결 미입력 세션 {allMissing.length}개
              </CardTitle>
            </CardHeader>
            <CardContent className='pt-0'>
              <div className='divide-y'>
                {allMissing.slice(0, 6).map((s) => (
                  <div key={s.sessionId} className='flex items-center justify-between gap-3 py-2'>
                    <div className='flex min-w-0 items-center gap-2 text-sm'>
                      <Badge variant='outline' className='shrink-0 text-xs font-normal'>
                        {s.cohortName.replace('전문인재 ', '')}
                      </Badge>
                      <span className='text-muted-foreground shrink-0 text-xs'>
                        {formatShortDate(s.sessionDate)}
                      </span>
                      <span className='truncate'>{s.title ?? '제목 없음'}</span>
                    </div>
                    <Link
                      href={`/dashboard/cohorts/${s.cohortId}/attendance/${s.sessionId}`}
                      className='text-primary shrink-0 text-xs font-medium hover:underline'
                    >
                      입력하기
                    </Link>
                  </div>
                ))}
                {allMissing.length > 6 && (
                  <div className='text-muted-foreground pt-2 text-xs'>
                    외 {allMissing.length - 6}개 더...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 소속 분포 */}
      <div className='mb-8'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>소속 분포</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryPieChart data={categoryChartData} />
          </CardContent>
        </Card>
      </div>

      {/* 교육과정별 현황 */}
      <div className='text-muted-foreground mb-3 text-sm font-medium'>교육과정 현황</div>
      <div className='grid gap-4'>
        {cohortData.map((c) => (
          <Card key={c.id}>
            <CardHeader className='pb-3'>
              <div className='flex items-center justify-between'>
                <CardTitle className='text-lg'>{c.name}</CardTitle>
                <Link
                  href={`/dashboard/cohorts/${c.id}`}
                  className='text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors'
                >
                  상세보기
                  <Icons.chevronRight className='h-3 w-3' />
                </Link>
              </div>
            </CardHeader>
            <CardContent className='pt-0'>
              {/* 기본 정보 */}
              <div className='text-muted-foreground mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm'>
                <span>{c.studentCount}명</span>
                {c.startedAt && <span>시작일 {formatShortDate(c.startedAt)}</span>}
                <span>수업 {c.doneSessions}/{c.totalSessions}회 완료</span>
                {c.attendanceRate != null && <span>출석률 {c.attendanceRate}%</span>}
              </div>

              {/* 진행 바 */}
              {c.totalSessions > 0 && (
                <div className='mb-4'>
                  <div className='mb-1 flex items-center justify-between'>
                    <span className='text-muted-foreground text-xs'>진행률</span>
                    <span className='text-xs font-medium'>{c.progressPct}%</span>
                  </div>
                  <div className='bg-muted h-2 overflow-hidden rounded-full'>
                    <div
                      className='h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all'
                      style={{ width: `${c.progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 하단 정보 */}
              <div className='flex flex-wrap gap-x-6 gap-y-2 text-sm'>
                {c.nextSession && (
                  <div className='flex items-center gap-2'>
                    <Icons.calendar className='text-muted-foreground h-3.5 w-3.5' />
                    <span className='text-muted-foreground'>다음 수업</span>
                    <span className='font-medium'>
                      {formatShortDate(c.nextSession.sessionDate)}
                    </span>
                    <span className='text-muted-foreground truncate text-xs'>
                      {c.nextSession.title}
                    </span>
                  </div>
                )}
                {!c.nextSession && c.totalSessions > 0 && (
                  <div className='text-muted-foreground flex items-center gap-2'>
                    <Icons.circleCheck className='h-3.5 w-3.5 text-green-500' />
                    전체 수업 완료
                  </div>
                )}
                {c.missingAttendance.length > 0 && (
                  <div className='flex items-center gap-2 text-amber-600 dark:text-amber-400'>
                    <Icons.warning className='h-3.5 w-3.5' />
                    <span>출결 미입력 {c.missingAttendance.length}건</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
