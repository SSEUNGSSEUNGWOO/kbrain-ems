import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { createClient } from '@/lib/supabase/server';

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
  const supabase = await createClient();

  const [
    { data: cohort },
    { count: studentCount },
    { data: sessions }
  ] = await Promise.all([
    supabase
      .from('cohorts')
      .select('id, name, started_at, ended_at')
      .eq('id', cohortId)
      .single(),
    supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('cohort_id', cohortId),
    supabase
      .from('sessions')
      .select('id, session_date, attendance_records(status)')
      .eq('cohort_id', cohortId)
      .order('session_date', { ascending: false })
  ]);

  if (!cohort) notFound();

  const today = new Date().toISOString().split('T')[0];
  const totalSessions = sessions?.length ?? 0;

  // 진행된 수업: 날짜가 오늘 이전인 것만
  const doneSessions = sessions?.filter((s) => s.session_date < today).length ?? 0;

  // 전체 출석률 계산
  const allRecords = sessions?.flatMap((s) => s.attendance_records ?? []) ?? [];
  const totalRecords = allRecords.length;
  const presentCount = allRecords.filter((r) => r.status === 'present').length;
  const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : null;

  const stats = [
    {
      label: '인원',
      value: studentCount != null ? `${studentCount}명` : '-',
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
