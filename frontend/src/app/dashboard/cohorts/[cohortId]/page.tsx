import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { cohorts, students, sessions, attendanceRecords } from '@/lib/db/schema';
import { eq, count, desc, inArray } from 'drizzle-orm';

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${m}월 ${d}일`;
}

const DOMAINS = [
  { slug: 'students', label: '인원 관리', desc: '교육생 명단 관리' },
  { slug: 'attendance', label: '출결', desc: '수업 회차별 출결 현황' },
  { slug: 'assignments', label: '과제', desc: '과제 출제, 제출, 채점' },
  { slug: 'completion', label: '수료', desc: '수료 기준 충족 여부' }
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
        session_date: sessions.sessionDate
      })
      .from(sessions)
      .where(eq(sessions.cohortId, cohortId))
      .orderBy(desc(sessions.sessionDate))
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
  const presentCount = allRecords.filter((r) => r.status === 'present').length;
  const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : null;

  const stats = [
    {
      label: '인원',
      value: `${studentCount}명`,
      sub: '등록된 인원'
    },
    {
      label: '진행 수업',
      value: totalSessions > 0 ? `${doneSessions} / ${totalSessions}회` : '-',
      sub: totalSessions > 0 ? `전체 ${totalSessions}회 중` : '수업 미등록'
    },
    {
      label: '평균 출석률',
      value: attendanceRate != null ? `${attendanceRate}%` : '-',
      sub: totalRecords > 0 ? `${totalRecords}개 기록` : '출결 미입력'
    }
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
      <div className='mb-6 grid gap-4 sm:grid-cols-3'>
        {stats.map((s) => (
          <div key={s.label} className='rounded-xl border px-6 py-5'>
            <div className='text-muted-foreground text-xs font-medium'>{s.label}</div>
            <div className='mt-1 text-3xl font-bold'>{s.value}</div>
            <div className='text-muted-foreground mt-1 text-xs'>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* 도메인 바로가기 */}
      <div className='text-muted-foreground mb-3 text-sm font-medium'>바로가기</div>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {DOMAINS.map((d) => (
          <Link
            key={d.slug}
            href={`/dashboard/cohorts/${cohortId}/${d.slug}`}
            className='hover:bg-accent block rounded-md border p-4 transition-colors'
          >
            <div className='font-semibold'>{d.label}</div>
            <div className='text-muted-foreground mt-1 text-xs'>{d.desc}</div>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
