import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Props = { params: Promise<{ instructorId: string }> };

const ROLE_LABEL: Record<string, string> = {
  main: '주강사',
  sub: '보조강사',
  assistant: '보조',
  ta: 'TA'
};

type SessionLink = {
  role: string;
  sessions: {
    id: string;
    session_date: string;
    title: string | null;
    cohort_id: string;
    cohorts: { id: string; name: string } | null;
  } | null;
};

type QuestionWithSurvey = {
  id: string;
  survey_id: string;
  text: string;
  surveys: { id: string; title: string | null; cohort_id: string } | null;
};

export default async function InstructorDetailPage({ params }: Props) {
  const { instructorId } = await params;
  const supabase = createAdminClient();

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id, name, affiliation, specialty, email, phone, notes, kind')
    .eq('id', instructorId)
    .maybeSingle();

  if (!instructor) notFound();

  const [{ data: sessionLinks }, { data: questions }] = await Promise.all([
    supabase
      .from('session_instructors')
      .select('role, sessions(id, session_date, title, cohort_id, cohorts(id, name))')
      .eq('instructor_id', instructorId)
      .returns<SessionLink[]>(),
    supabase
      .from('survey_questions')
      .select('id, survey_id, text, surveys(id, title, cohort_id)')
      .eq('instructor_id', instructorId)
      .eq('type', 'likert10')
      .returns<QuestionWithSurvey[]>()
  ]);

  const surveyIds = Array.from(
    new Set((questions ?? []).map((q) => q.survey_id))
  );

  const { data: responses } =
    surveyIds.length > 0
      ? await supabase
          .from('survey_responses')
          .select('survey_id, responses')
          .in('survey_id', surveyIds)
          .not('submitted_at', 'is', null)
      : { data: [] as { survey_id: string; responses: Json | null }[] };

  const questionIds = new Set((questions ?? []).map((q) => q.id));

  let scoreSum = 0;
  let scoreCount = 0;
  const byCohort = new Map<string, { name: string; sum: number; count: number }>();

  for (const r of responses ?? []) {
    const obj = (r.responses ?? {}) as Record<string, unknown>;
    const q = (questions ?? []).find((qq) => qq.survey_id === r.survey_id);
    const cohortId = q?.surveys?.cohort_id;
    const cohortName = q?.surveys?.title ?? null;

    for (const qid of questionIds) {
      const v = obj[qid];
      if (typeof v !== 'number' || v < 1 || v > 5) continue;
      scoreSum += v;
      scoreCount += 1;
      if (cohortId) {
        const entry = byCohort.get(cohortId) ?? { name: cohortName ?? '—', sum: 0, count: 0 };
        entry.sum += v;
        entry.count += 1;
        byCohort.set(cohortId, entry);
      }
    }
  }

  const avgScore = scoreCount > 0 ? scoreSum / scoreCount : null;

  type SessionItem = {
    id: string;
    date: string;
    title: string | null;
    role: string;
    cohortId: string;
    cohortName: string;
    cohortAvg: number | null;
  };

  const sessions: SessionItem[] = (sessionLinks ?? [])
    .filter((s) => s.sessions)
    .map((s) => {
      const cohortId = s.sessions!.cohort_id;
      const cohortStat = byCohort.get(cohortId);
      return {
        id: s.sessions!.id,
        date: s.sessions!.session_date,
        title: s.sessions!.title,
        role: s.role,
        cohortId,
        cohortName: s.sessions!.cohorts?.name ?? '—',
        cohortAvg: cohortStat ? cohortStat.sum / cohortStat.count : null
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const byCohortIds = Array.from(
    new Map(sessions.map((s) => [s.cohortId, s])).values()
  );

  return (
    <PageContainer
      pageTitle={instructor.name}
      pageDescription={
        instructor.kind === 'sub' ? '보조강사 상세' : '강사 상세'
      }
      pageHeaderAction={
        <Button variant='outline' size='sm' asChild>
          <Link href='/dashboard/instructors'>
            <Icons.chevronLeft className='h-4 w-4' />
            강사풀
          </Link>
        </Button>
      }
    >
      <div className='flex flex-col gap-6'>
        <InstructorHeader instructor={instructor} avgScore={avgScore} responseCount={scoreCount} />

        <CohortAvgSection cohortStats={byCohortIds} byCohort={byCohort} />

        <SessionsSection sessions={sessions} />
      </div>
    </PageContainer>
  );
}

function InstructorHeader({
  instructor,
  avgScore,
  responseCount
}: {
  instructor: {
    name: string;
    affiliation: string | null;
    specialty: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    kind: string | null;
  };
  avgScore: number | null;
  responseCount: number;
}) {
  return (
    <Card>
      <CardContent className='flex flex-wrap items-start justify-between gap-4 px-6 py-5'>
        <div className='flex flex-col gap-1.5'>
          <div className='flex items-center gap-2'>
            <h2 className='text-xl font-semibold'>{instructor.name}</h2>
            <Badge variant='outline' className='font-normal'>
              {instructor.kind === 'sub' ? '보조강사' : '강사'}
            </Badge>
          </div>
          <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm'>
            {instructor.affiliation && <span>{instructor.affiliation}</span>}
            {instructor.specialty && <span>{instructor.specialty}</span>}
          </div>
          {(instructor.email || instructor.phone) && (
            <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs'>
              {instructor.email && <span>{instructor.email}</span>}
              {instructor.phone && <span>{instructor.phone}</span>}
            </div>
          )}
          {instructor.notes && (
            <p className='text-muted-foreground mt-2 text-sm'>{instructor.notes}</p>
          )}
        </div>
        <div className='flex flex-col items-end gap-1'>
          <span className='text-muted-foreground text-xs'>평균 만족도</span>
          <span className='text-foreground text-3xl leading-tight font-semibold tabular-nums'>
            {avgScore !== null ? avgScore.toFixed(2) : '—'}
            <span className='text-muted-foreground ml-1 text-base font-normal'>/ 10</span>
          </span>
          <span className='text-muted-foreground text-xs'>
            응답 {responseCount}건
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CohortAvgSection({
  cohortStats,
  byCohort
}: {
  cohortStats: { cohortId: string; cohortName: string }[];
  byCohort: Map<string, { name: string; sum: number; count: number }>;
}) {
  if (byCohort.size === 0) return null;
  return (
    <Card>
      <CardContent className='px-6 py-5'>
        <div className='mb-3 flex items-center gap-2'>
          <Icons.chat className='text-muted-foreground h-4 w-4' />
          <h3 className='text-sm font-semibold'>기수별 만족도</h3>
        </div>
        <div className='grid gap-2'>
          {cohortStats.map((c) => {
            const stat = byCohort.get(c.cohortId);
            if (!stat) return null;
            const avg = stat.sum / stat.count;
            return (
              <div
                key={c.cohortId}
                className='flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm'
              >
                <Link
                  href={`/dashboard/cohorts/${c.cohortId}`}
                  className='hover:underline truncate'
                >
                  {c.cohortName}
                </Link>
                <div className='flex items-center gap-2'>
                  <span className='font-semibold tabular-nums'>{avg.toFixed(2)}</span>
                  <span className='text-muted-foreground text-xs'>
                    / 10 · {stat.count}건
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SessionsSection({
  sessions
}: {
  sessions: {
    id: string;
    date: string;
    title: string | null;
    role: string;
    cohortId: string;
    cohortName: string;
    cohortAvg: number | null;
  }[];
}) {
  return (
    <Card>
      <CardContent className='px-6 py-5'>
        <div className='mb-3 flex items-center gap-2'>
          <Icons.calendar className='text-muted-foreground h-4 w-4' />
          <h3 className='text-sm font-semibold'>강의 이력</h3>
          <Badge variant='secondary'>{sessions.length}</Badge>
        </div>
        {sessions.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            이 강사에게 배정된 수업이 없습니다.
          </p>
        ) : (
          <div className='flex flex-col divide-y'>
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/cohorts/${s.cohortId}/lessons/${s.id}`}
                className='hover:bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 text-sm transition-colors'
              >
                <span className='text-muted-foreground w-20 shrink-0 font-mono text-xs tabular-nums'>
                  {s.date}
                </span>
                <span className='min-w-0 flex-1 truncate font-medium'>
                  {s.cohortName}
                </span>
                <span className='text-muted-foreground min-w-0 flex-1 truncate text-sm'>
                  {s.title ?? '제목 없음'}
                </span>
                <Badge
                  variant='outline'
                  className={cn(
                    'font-normal',
                    s.role === 'main'
                      ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                  )}
                >
                  {ROLE_LABEL[s.role] ?? s.role}
                </Badge>
                {s.cohortAvg !== null && (
                  <span className='text-muted-foreground text-xs tabular-nums'>
                    기수 평균 {s.cohortAvg.toFixed(2)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
