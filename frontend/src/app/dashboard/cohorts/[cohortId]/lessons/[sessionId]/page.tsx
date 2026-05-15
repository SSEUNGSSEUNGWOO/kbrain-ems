import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import { assistantNeedFor } from '@/lib/assistant-schedule';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ cohortId: string; sessionId: string }>;
};

type AttStatus = 'present' | 'late' | 'absent' | 'excused' | 'early_leave' | 'none';

const STATUS_LABEL: Record<AttStatus, string> = {
  present: '출석',
  late: '지각',
  early_leave: '조퇴',
  absent: '결석',
  excused: '인정',
  none: '미입력'
};

const STATUS_COLOR: Record<AttStatus, string> = {
  present: 'bg-emerald-500',
  late: 'bg-amber-500',
  early_leave: 'bg-amber-400',
  absent: 'bg-red-500',
  excused: 'bg-blue-400',
  none: 'bg-muted-foreground/30'
};

function scoreColor(avg: number | null): string {
  if (avg === null) return 'text-muted-foreground';
  if (avg >= 4.5) return 'text-emerald-700 dark:text-emerald-300';
  if (avg >= 4.0) return 'text-blue-700 dark:text-blue-300';
  if (avg >= 3.5) return 'text-amber-700 dark:text-amber-300';
  if (avg >= 3.0) return 'text-orange-700 dark:text-orange-300';
  return 'text-red-700 dark:text-red-300';
}

export default async function LessonDetailPage({ params }: Props) {
  const { cohortId, sessionId } = await params;
  const supabase = createAdminClient();

  const sessionRes = await supabase
    .from('sessions')
    .select(
      'id, session_date, title, cohort_id, locations(name), session_instructors(role, instructors(id, name, affiliation))'
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (!sessionRes.data || sessionRes.data.cohort_id !== cohortId) notFound();

  const session = sessionRes.data as unknown as {
    id: string;
    session_date: string;
    title: string | null;
    cohort_id: string;
    locations: { name: string } | null;
    session_instructors: {
      role: string;
      instructors: { id: string; name: string; affiliation: string | null } | null;
    }[];
  };

  // 병렬 fetch
  const [attRes, surveyListRes, assignmentListRes, cohortRes, studentCountRes] = await Promise.all([
    supabase.from('attendance_records').select('status').eq('session_id', sessionId),
    supabase
      .from('surveys')
      .select('id, title, share_code, opens_at, respondent_total')
      .eq('session_id', sessionId)
      .eq('type', 'satisfaction'),
    supabase
      .from('assignments')
      .select('id, title, description, due_date')
      .eq('session_id', sessionId),
    supabase.from('cohorts').select('id, name, delivery_method').eq('id', cohortId).maybeSingle(),
    supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId)
  ]);

  // 보조강사 산출 — cohort 내 sessions 순번 필요
  const { data: cohortSessions } = await supabase
    .from('sessions')
    .select('id, session_date')
    .eq('cohort_id', cohortId)
    .order('session_date');
  const assistantNeed = assistantNeedFor(
    cohortRes.data?.delivery_method ?? null,
    cohortSessions ?? [],
    sessionId
  );

  // 출결 분포
  const att = attRes.data ?? [];
  const counts: Record<AttStatus, number> = {
    present: 0,
    late: 0,
    early_leave: 0,
    absent: 0,
    excused: 0,
    none: 0
  };
  for (const r of att) {
    const s = (r.status as AttStatus) ?? 'none';
    if (s in counts) counts[s]++;
  }
  const total = att.length;
  const filled = total - counts.none;
  const fillRate = total > 0 ? (filled / total) * 100 : 0;
  const attendanceCount = counts.present + counts.late + counts.early_leave;
  const attendanceRate = total > 0 ? (attendanceCount / total) * 100 : 0;

  // 만족도 평균 (이 수업의 모든 설문 합산)
  const surveys = surveyListRes.data ?? [];
  const surveyStats = await Promise.all(
    surveys.map(async (sv) => {
      const [qsRes, resRes] = await Promise.all([
        supabase.from('survey_questions').select('id, type').eq('survey_id', sv.id),
        supabase
          .from('survey_responses')
          .select('responses, submitted_at')
          .eq('survey_id', sv.id)
          .not('submitted_at', 'is', null)
      ]);
      const likertIds = new Set(
        (qsRes.data ?? []).filter((q) => q.type === 'likert10').map((q) => q.id)
      );
      let sum = 0;
      let n = 0;
      const submitted = resRes.data ?? [];
      for (const r of submitted) {
        const obj = (r.responses ?? {}) as Record<string, unknown>;
        for (const qid of likertIds) {
          const v = obj[qid];
          if (typeof v === 'number') {
            sum += v;
            n++;
          }
        }
      }
      return {
        id: sv.id,
        title: sv.title,
        published: sv.opens_at !== null,
        respondentTotal: sv.respondent_total,
        submittedCount: submitted.length,
        avg: n > 0 ? sum / n : null
      };
    })
  );

  const surveyOverallAvg = (() => {
    let sum = 0;
    let n = 0;
    for (const s of surveyStats) {
      if (s.avg !== null) {
        sum += s.avg * s.submittedCount;
        n += s.submittedCount;
      }
    }
    return n > 0 ? sum / n : null;
  })();

  // 이 세션에 묶인 과제별 제출률
  const assignments = assignmentListRes.data ?? [];
  const studentCount = studentCountRes.count ?? 0;
  type AssignmentStat = {
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    submittedCount: number;
    rate: number | null;
  };
  let assignmentStats: AssignmentStat[] = [];
  if (assignments.length > 0) {
    const assignmentIds = assignments.map((a) => a.id);
    const { data: subs } = await supabase
      .from('assignment_submissions')
      .select('assignment_id')
      .in('assignment_id', assignmentIds);
    const byAssignment = new Map<string, number>();
    for (const s of subs ?? []) {
      byAssignment.set(s.assignment_id, (byAssignment.get(s.assignment_id) ?? 0) + 1);
    }
    assignmentStats = assignments.map((a) => {
      const submittedCount = byAssignment.get(a.id) ?? 0;
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        dueDate: a.due_date,
        submittedCount,
        rate: studentCount > 0 ? (submittedCount / studentCount) * 100 : null
      };
    });
  }
  const overallAssignmentRate = (() => {
    if (assignmentStats.length === 0 || studentCount === 0) return null;
    const sum = assignmentStats.reduce((acc, a) => acc + a.submittedCount, 0);
    const expected = studentCount * assignmentStats.length;
    return expected > 0 ? (sum / expected) * 100 : null;
  })();

  const cohortName = cohortRes.data?.name ?? '';
  const instructorList = session.session_instructors
    .map((si) => si.instructors)
    .filter((x): x is { id: string; name: string; affiliation: string | null } => !!x);

  return (
    <PageContainer
      pageTitle={session.title ?? '수업 상세'}
      pageDescription={`${cohortName} · ${session.session_date}${session.locations?.name ? ' · ' + session.locations.name : ''}`}
      pageHeaderAction={
        <div className='flex gap-2'>
          <Link href={`/dashboard/cohorts/${cohortId}/attendance/${sessionId}`}>
            <Button variant='outline'>출결 입력</Button>
          </Link>
          <Link href={`/dashboard/cohorts/${cohortId}/lessons/${sessionId}/edit`}>
            <Button variant='outline'>수업 수정</Button>
          </Link>
          <Link href={`/dashboard/cohorts/${cohortId}/lessons`}>
            <Button variant='outline'>← 목록</Button>
          </Link>
        </div>
      }
    >
      <div className='max-w-4xl space-y-6'>
        {/* KPI */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <Kpi
            label='출결 입력률'
            value={`${Math.round(fillRate)}%`}
            sub={`${filled} / ${total}명`}
            accent='blue'
          />
          <Kpi
            label='출석률'
            value={`${Math.round(attendanceRate)}%`}
            sub={`출석+지각+조퇴 ${attendanceCount}명`}
            accent='emerald'
          />
          <Kpi
            label='만족도 평균'
            value={surveyOverallAvg !== null ? surveyOverallAvg.toFixed(2) : '-'}
            unit={surveyOverallAvg !== null ? '/ 10' : undefined}
            sub={surveys.length === 0 ? '연결된 설문 없음' : `설문 ${surveys.length}개`}
            accent='violet'
            valueClassName={scoreColor(surveyOverallAvg)}
          />
          <Kpi
            label='과제 제출률'
            value={overallAssignmentRate !== null ? `${Math.round(overallAssignmentRate)}%` : '-'}
            sub={
              assignmentStats.length === 0
                ? '연결된 과제 없음'
                : `과제 ${assignmentStats.length}개 · 학생 ${studentCount}명`
            }
            accent='slate'
          />
        </div>

        {/* 출결 분포 */}
        {total > 0 && (
          <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
            <h2 className='mb-1 text-sm font-bold'>출결 분포</h2>
            <p className='mb-4 text-xs text-muted-foreground'>{total}명 기준</p>
            <div className='flex h-3 w-full overflow-hidden rounded-full'>
              {(Object.keys(counts) as AttStatus[]).map((s) => {
                const c = counts[s];
                if (c === 0) return null;
                const pct = (c / total) * 100;
                return (
                  <div
                    key={s}
                    className={STATUS_COLOR[s]}
                    style={{ width: `${pct}%` }}
                    title={`${STATUS_LABEL[s]} ${c}명 (${pct.toFixed(0)}%)`}
                  />
                );
              })}
            </div>
            <div className='mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3'>
              {(Object.keys(counts) as AttStatus[]).map((s) => (
                <div key={s} className='flex items-center justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_COLOR[s]}`} />
                    <span className='text-xs text-muted-foreground'>{STATUS_LABEL[s]}</span>
                  </div>
                  <span className='text-sm font-semibold tabular-nums'>{counts[s]}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 보조강사 필요 시간 */}
        <section
          className={`rounded-xl border px-6 py-5 shadow-sm ${
            assistantNeed.needed
              ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-900/10'
              : 'border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/20'
          }`}
        >
          <h2 className='mb-2 text-sm font-bold'>보조강사</h2>
          <div className='flex items-center gap-3'>
            <span
              className={`rounded-md px-2 py-1 text-xs font-bold ${
                assistantNeed.needed
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
              }`}
            >
              {assistantNeed.needed ? '필요' : '불필요'}
            </span>
            <span className='text-base font-bold tabular-nums'>{assistantNeed.timeRange}</span>
            <span className='text-xs text-muted-foreground'>{assistantNeed.reason}</span>
          </div>
        </section>

        {/* 강사 카드 */}
        {instructorList.length > 0 && (
          <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
            <h2 className='mb-3 text-sm font-bold'>강사</h2>
            <ul className='space-y-2'>
              {instructorList.map((i) => (
                <li key={i.id} className='flex items-center gap-2 text-sm'>
                  <span className='font-medium'>{i.name}</span>
                  {i.affiliation && (
                    <span className='text-xs text-muted-foreground'>· {i.affiliation}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 만족도 설문 */}
        <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
          <h2 className='mb-3 text-sm font-bold'>만족도 설문</h2>
          {surveys.length === 0 ? (
            <p className='text-xs text-muted-foreground'>이 수업에 연결된 설문이 없습니다.</p>
          ) : (
            <div className='space-y-3'>
              {surveyStats.map((s) => {
                const denom = s.respondentTotal;
                const rate =
                  denom && denom > 0 ? Math.round((s.submittedCount / denom) * 100) : null;
                return (
                  <div
                    key={s.id}
                    className='flex items-center justify-between gap-3 rounded-lg border bg-background/60 px-4 py-3'
                  >
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-2'>
                        <span
                          className={
                            s.published
                              ? 'rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          }
                        >
                          {s.published ? '발행됨' : '초안'}
                        </span>
                        <span className='truncate text-sm font-medium'>{s.title}</span>
                      </div>
                      <div className='mt-1 text-xs text-muted-foreground'>
                        제출 {s.submittedCount}
                        {denom !== null ? ` / ${denom}` : ''}
                        {rate !== null ? ` (${rate}%)` : ''}
                      </div>
                    </div>
                    <div className='shrink-0 text-right'>
                      <div className={`text-2xl font-bold tabular-nums ${scoreColor(s.avg)}`}>
                        {s.avg !== null ? s.avg.toFixed(2) : '-'}
                        <span className='ml-0.5 text-xs font-normal text-muted-foreground'>/5</span>
                      </div>
                    </div>
                    {s.submittedCount > 0 && (
                      <Link
                        href={`/dashboard/cohorts/${cohortId}/surveys/${s.id}/results`}
                        className='shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700'
                      >
                        결과 →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 이 수업의 과제 */}
        <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
          <h2 className='mb-3 text-sm font-bold'>이 수업의 과제</h2>
          {assignmentStats.length === 0 ? (
            <p className='text-xs text-muted-foreground'>이 수업에 연결된 과제가 없습니다.</p>
          ) : (
            <div className='space-y-3'>
              {assignmentStats.map((a) => (
                <div
                  key={a.id}
                  className='flex items-center justify-between gap-3 rounded-lg border bg-background/60 px-4 py-3'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='truncate text-sm font-medium'>{a.title}</div>
                    <div className='mt-0.5 text-xs text-muted-foreground'>
                      {a.dueDate ? `마감 ${a.dueDate}` : '마감 미설정'}
                      {' · '}
                      제출 {a.submittedCount}
                      {studentCount > 0 ? ` / ${studentCount}` : ''}
                    </div>
                  </div>
                  <div className='shrink-0 text-right'>
                    <div className='text-2xl font-bold tabular-nums'>
                      {a.rate !== null ? `${Math.round(a.rate)}%` : '-'}
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/cohorts/${cohortId}/assignments/${a.id}`}
                    className='shrink-0 rounded-md border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted'
                  >
                    상세 →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function Kpi({
  label,
  value,
  unit,
  sub,
  accent,
  valueClassName
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent: 'blue' | 'emerald' | 'violet' | 'slate';
  valueClassName?: string;
}) {
  const accentClass: Record<typeof accent, string> = {
    blue: 'border-blue-200 bg-blue-50/40 dark:border-blue-900/30 dark:bg-blue-900/10',
    emerald: 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-900/10',
    violet: 'border-violet-200 bg-violet-50/40 dark:border-violet-900/30 dark:bg-violet-900/10',
    slate: 'border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/30'
  };
  return (
    <div className={`rounded-xl border px-4 py-4 shadow-sm ${accentClass[accent]}`}>
      <div className='text-xs font-semibold text-muted-foreground'>{label}</div>
      <div className='mt-1 flex items-baseline gap-1'>
        <span className={`text-3xl font-bold tabular-nums ${valueClassName ?? ''}`}>{value}</span>
        {unit && <span className='text-sm text-muted-foreground'>{unit}</span>}
      </div>
      {sub && <div className='mt-1 truncate text-[11px] text-muted-foreground'>{sub}</div>}
    </div>
  );
}
