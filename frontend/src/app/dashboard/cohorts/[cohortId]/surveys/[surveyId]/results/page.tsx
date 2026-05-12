import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/server';
import { buildDisplayNoMap, computeFollowUpMap } from '@/lib/survey-display';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SectionAverageChart } from './_components/section-average-chart';

type Props = {
  params: Promise<{ cohortId: string; surveyId: string }>;
};

type LikertStat = {
  count: number;
  sum: number;
  avg: number | null;
  distribution: number[]; // index 0 = score 1, .. index 4 = score 5
};

function emptyStat(): LikertStat {
  return { count: 0, sum: 0, avg: null, distribution: [0, 0, 0, 0, 0] };
}

function pushScore(stat: LikertStat, v: number) {
  stat.count++;
  stat.sum += v;
  if (v >= 1 && v <= 5) stat.distribution[v - 1]++;
}

function finalize(stat: LikertStat) {
  stat.avg = stat.count > 0 ? stat.sum / stat.count : null;
}

export default async function SurveyResultsPage({ params }: Props) {
  const { cohortId, surveyId } = await params;
  const supabase = createAdminClient();

  const [surveyRes, questionsRes, responsesRes, cohortRes] = await Promise.all([
    supabase
      .from('surveys')
      .select('id, title, share_code, opens_at, respondent_total, cohort_id')
      .eq('id', surveyId)
      .maybeSingle(),
    supabase
      .from('survey_questions')
      .select('id, question_no, type, text, section_no, section_title, instructor_id')
      .eq('survey_id', surveyId)
      .order('question_no', { ascending: true }),
    supabase
      .from('survey_responses')
      .select('responses, submitted_at')
      .eq('survey_id', surveyId)
      .not('submitted_at', 'is', null),
    supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle()
  ]);

  if (!surveyRes.data || !questionsRes.data || !cohortRes.data) notFound();
  if (surveyRes.data.cohort_id !== cohortId) notFound();

  const survey = surveyRes.data;
  const questions = questionsRes.data;
  const submitted = responsesRes.data ?? [];

  // 분모
  let totalStudents = survey.respondent_total ?? null;
  if (totalStudents === null) {
    const { count } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', cohortId);
    totalStudents = count ?? 0;
  }

  // 강사 이름 fetch
  const instructorIds = Array.from(
    new Set(questions.map((q) => q.instructor_id).filter((x): x is string => !!x))
  );
  const instructorNameById = new Map<string, string>();
  if (instructorIds.length > 0) {
    const { data: ins } = await supabase
      .from('instructors')
      .select('id, name')
      .in('id', instructorIds);
    for (const i of ins ?? []) instructorNameById.set(i.id, i.name);
  }

  // ---- 통계 집계 ----------------------------------------------------------
  const overall = emptyStat();
  const bySectionNo = new Map<number, { title: string; stat: LikertStat }>();
  const byInstructorId = new Map<string, { name: string; stat: LikertStat }>();
  const byQuestion = new Map<string, LikertStat>(); // question_id → stat (likert만)

  // recommend Q 찾기 — "추천" 키워드 + likert5 + section_no=1
  const recommendQ = questions.find(
    (q) => q.type === 'likert5' && q.section_no === 1 && q.text.includes('추천')
  );
  const recommendStat = emptyStat();

  // 서술형 응답 모음 (sec6) + follow-up 사유
  type TextEntry = { questionId: string; text: string; submittedAt: string | null };
  const sec6Texts = new Map<string, TextEntry[]>(); // question_id → entries
  const followUpTexts = new Map<string, { linked: string; entries: TextEntry[] }>(); // text q id → { linked likert id, entries }

  const followUpMap = computeFollowUpMap(questions);
  const displayNo = buildDisplayNoMap(questions, followUpMap);
  const getDisplayNo = (id: string) => displayNo.get(id) ?? '?';

  for (const r of submitted) {
    const obj = (r.responses ?? {}) as Record<string, unknown>;
    for (const q of questions) {
      const v = obj[q.id];
      if (v === undefined || v === null || v === '') continue;

      if (q.type === 'likert5' && typeof v === 'number') {
        pushScore(overall, v);

        const sec = q.section_no ?? 0;
        if (!bySectionNo.has(sec)) {
          bySectionNo.set(sec, { title: q.section_title ?? `섹션 ${sec}`, stat: emptyStat() });
        }
        pushScore(bySectionNo.get(sec)!.stat, v);

        if (q.instructor_id) {
          if (!byInstructorId.has(q.instructor_id)) {
            byInstructorId.set(q.instructor_id, {
              name: instructorNameById.get(q.instructor_id) ?? '강사',
              stat: emptyStat()
            });
          }
          pushScore(byInstructorId.get(q.instructor_id)!.stat, v);
        }

        if (!byQuestion.has(q.id)) byQuestion.set(q.id, emptyStat());
        pushScore(byQuestion.get(q.id)!, v);

        if (recommendQ && q.id === recommendQ.id) pushScore(recommendStat, v);
      } else if (q.type === 'text' && typeof v === 'string' && v.trim().length > 0) {
        const entry: TextEntry = { questionId: q.id, text: v.trim(), submittedAt: r.submitted_at };
        if (q.section_no === 6) {
          if (!sec6Texts.has(q.id)) sec6Texts.set(q.id, []);
          sec6Texts.get(q.id)!.push(entry);
        } else if (followUpMap.has(q.id)) {
          if (!followUpTexts.has(q.id)) {
            followUpTexts.set(q.id, { linked: followUpMap.get(q.id)!, entries: [] });
          }
          followUpTexts.get(q.id)!.entries.push(entry);
        }
      }
    }
  }

  finalize(overall);
  for (const v of bySectionNo.values()) finalize(v.stat);
  for (const v of byInstructorId.values()) finalize(v.stat);
  for (const v of byQuestion.values()) finalize(v);
  finalize(recommendStat);

  const responseRate =
    totalStudents > 0 ? Math.round((submitted.length / totalStudents) * 100) : 0;

  // 섹션별 차트 데이터 (likert 문항이 있는 섹션만, 섹션 순)
  const sectionChartData = Array.from(bySectionNo.entries())
    .toSorted((a, b) => a[0] - b[0])
    .map(([no, v]) => ({
      name: `${no}. ${v.title.replace(/^섹션 \d+ — /, '').slice(0, 14)}`,
      평균: Number(v.stat.avg?.toFixed(2) ?? 0),
      응답수: v.stat.count
    }));

  // 강사 카드용
  const instructorCards = Array.from(byInstructorId.entries()).map(([id, v]) => ({
    id,
    name: v.name,
    avg: v.stat.avg,
    count: v.stat.count,
    distribution: v.stat.distribution
  }));

  // 문항별 분포 (척도만) — 섹션별 그룹핑
  const likertQuestions = questions.filter((q) => q.type === 'likert5');
  const sectionGroups = Array.from(
    likertQuestions.reduce(
      (acc, q) => {
        const sec = q.section_no ?? 0;
        const cur = acc.get(sec) ?? {
          sectionNo: sec,
          title: q.section_title ?? `섹션 ${sec}`,
          instructorId: q.instructor_id,
          questions: [] as typeof likertQuestions
        };
        cur.questions.push(q);
        acc.set(sec, cur);
        return acc;
      },
      new Map<
        number,
        {
          sectionNo: number;
          title: string;
          instructorId: string | null;
          questions: typeof likertQuestions;
        }
      >()
    ).values()
  ).toSorted((a, b) => a.sectionNo - b.sectionNo);

  // 서술형 sec6 정렬
  const sec6Questions = questions.filter((q) => q.section_no === 6 && q.type === 'text');

  // follow-up 정렬
  const followUpQuestions = questions.filter((q) => followUpMap.has(q.id));

  return (
    <PageContainer
      pageTitle='설문 결과'
      pageDescription={`${cohortRes.data.name} · ${survey.title}`}
      pageHeaderAction={
        <div className='flex gap-2'>
          <Link href={`/dashboard/cohorts/${cohortId}/surveys/${surveyId}/preview`}>
            <Button variant='outline'>미리보기</Button>
          </Link>
          <Link href={`/dashboard/cohorts/${cohortId}/surveys`}>
            <Button variant='outline'>← 목록</Button>
          </Link>
        </div>
      }
    >
      <div className='max-w-4xl space-y-6'>
        {/* KPI */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <Kpi
            label='전체 평균'
            value={overall.avg !== null ? overall.avg.toFixed(2) : '-'}
            unit='/ 5'
            sub={`척도 응답 ${overall.count}건`}
            accent='blue'
            valueClassName={scoreColor(overall.avg).text}
          />
          <Kpi
            label='응답률'
            value={`${responseRate}%`}
            sub={`${submitted.length} / ${totalStudents}명 제출`}
            accent='emerald'
          />
          <Kpi
            label='추천 의향'
            value={recommendStat.avg !== null ? recommendStat.avg.toFixed(2) : '-'}
            unit='/ 5'
            sub={recommendQ ? `Q${getDisplayNo(recommendQ.id)}` : '추천 문항 없음'}
            accent='violet'
            valueClassName={scoreColor(recommendStat.avg).text}
          />
          <Kpi
            label='응답 수'
            value={String(submitted.length)}
            sub={`발행 ${survey.opens_at ? new Date(survey.opens_at).toLocaleDateString('ko-KR') : '-'}`}
            accent='slate'
          />
        </div>

        {/* 섹션별 평균 */}
        {sectionChartData.length > 0 && (
          <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
            <h2 className='mb-1 text-sm font-bold'>섹션별 평균</h2>
            <p className='mb-4 text-xs text-muted-foreground'>각 섹션의 척도 문항 평균 (5점 만점)</p>
            <SectionAverageChart data={sectionChartData} />
          </section>
        )}

        {/* 문항별 분포 — 섹션별 그룹핑 */}
        {likertQuestions.length > 0 && (
          <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
            <h2 className='mb-1 text-sm font-bold'>문항별 응답 분포</h2>
            <p className='mb-5 text-xs text-muted-foreground'>섹션별로 묶은 척도 문항 결과</p>
            <div className='space-y-6'>
              {sectionGroups.map((group) => {
                const sectionStat = bySectionNo.get(group.sectionNo)?.stat;
                const sectionAvg = sectionStat?.avg ?? null;
                const sectionColor = scoreColor(sectionAvg);
                const instructorName = group.instructorId
                  ? instructorNameById.get(group.instructorId) ?? null
                  : null;
                return (
                  <div key={group.sectionNo}>
                    <div className='mb-3 flex items-baseline justify-between gap-3 border-b pb-2'>
                      <div className='flex items-baseline gap-2'>
                        <span className='text-xs font-bold text-blue-600 dark:text-blue-400'>
                          {group.sectionNo}.
                        </span>
                        <span className='text-sm font-bold'>{group.title}</span>
                        {instructorName && (
                          <span className='rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'>
                            {instructorName}
                          </span>
                        )}
                      </div>
                      {sectionAvg !== null && (
                        <div className='text-xs text-muted-foreground'>
                          섹션 평균{' '}
                          <span className={`font-bold tabular-nums ${sectionColor.text}`}>
                            {sectionAvg.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                      {group.questions.map((q) => {
                        const stat = byQuestion.get(q.id);
                        if (!stat) return null;
                        return (
                          <QuestionStatBlock
                            key={q.id}
                            questionNo={getDisplayNo(q.id)}
                            text={q.text}
                            avg={stat.avg}
                            count={stat.count}
                            distribution={stat.distribution}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 강사 비교 */}
        {instructorCards.length > 0 && (
          <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
            <h2 className='mb-4 text-sm font-bold'>강사 만족도 비교</h2>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              {instructorCards.map((i) => (
                <InstructorBlock key={i.id} {...i} />
              ))}
            </div>
          </section>
        )}

        {/* 서술형 응답 */}
        {sec6Questions.length > 0 && (
          <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
            <h2 className='mb-4 text-sm font-bold'>서술형 응답</h2>
            <div className='space-y-5'>
              {sec6Questions.map((q) => {
                const entries = sec6Texts.get(q.id) ?? [];
                return (
                  <div key={q.id}>
                    <h3 className='mb-2 text-xs font-semibold text-muted-foreground'>
                      Q{getDisplayNo(q.id)}. {q.text}
                    </h3>
                    {entries.length === 0 ? (
                      <p className='text-xs text-muted-foreground'>응답 없음</p>
                    ) : (
                      <ul className='space-y-2'>
                        {entries.map((e, idx) => (
                          <li
                            key={idx}
                            className='whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm'
                          >
                            {e.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* follow-up 사유 */}
        {followUpQuestions.length > 0 && (
          <section className='rounded-xl border bg-card px-6 py-5 shadow-sm'>
            <h2 className='mb-1 text-sm font-bold'>불만족·개선 사유 (조건부 응답)</h2>
            <p className='mb-4 text-xs text-muted-foreground'>
              직전 척도 점수가 낮을 때만 노출된 사유 응답
            </p>
            <div className='space-y-5'>
              {followUpQuestions.map((q) => {
                const block = followUpTexts.get(q.id);
                const entries = block?.entries ?? [];
                if (entries.length === 0) return null;
                const linkedId = followUpMap.get(q.id);
                const linkedQ = linkedId ? questions.find((x) => x.id === linkedId) : null;
                return (
                  <div key={q.id}>
                    <div className='mb-2 rounded-md border-l-2 border-amber-400 bg-amber-50/40 px-3 py-2 dark:border-amber-500 dark:bg-amber-900/10'>
                      {linkedQ && (
                        <div className='text-xs font-semibold text-slate-700 dark:text-slate-200'>
                          Q{getDisplayNo(linkedQ.id)}. {linkedQ.text}
                        </div>
                      )}
                      <div className='mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400'>
                        <span>↳ Q{getDisplayNo(q.id)}</span>
                        <span className='text-amber-600/70'>·</span>
                        <span>{q.text}</span>
                      </div>
                    </div>
                    <ul className='space-y-2'>
                      {entries.map((e, idx) => (
                        <li
                          key={idx}
                          className='whitespace-pre-wrap rounded-md border border-amber-200/60 bg-amber-50/40 px-3 py-2 text-sm dark:border-amber-900/30 dark:bg-amber-900/10'
                        >
                          {e.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {followUpQuestions.every((q) => (followUpTexts.get(q.id)?.entries.length ?? 0) === 0) && (
                <p className='text-xs text-muted-foreground'>해당하는 사유 응답이 없습니다.</p>
              )}
            </div>
          </section>
        )}
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
      {sub && <div className='mt-1 text-[11px] text-muted-foreground'>{sub}</div>}
    </div>
  );
}

// 평균 점수 범위별 색 (5점 만점 기준)
function scoreColor(avg: number | null): { text: string; bar: string } {
  if (avg === null) return { text: 'text-muted-foreground', bar: 'bg-muted' };
  if (avg >= 4.5) return { text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' };
  if (avg >= 4.0) return { text: 'text-blue-700 dark:text-blue-300', bar: 'bg-blue-500' };
  if (avg >= 3.5) return { text: 'text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' };
  if (avg >= 3.0) return { text: 'text-orange-700 dark:text-orange-300', bar: 'bg-orange-500' };
  return { text: 'text-red-700 dark:text-red-300', bar: 'bg-red-500' };
}

function QuestionStatBlock({
  questionNo,
  text,
  avg,
  count,
  distribution
}: {
  questionNo: string;
  text: string;
  avg: number | null;
  count: number;
  distribution: number[];
}) {
  const total = distribution.reduce((a, b) => a + b, 0) || 1;
  const color = scoreColor(avg);
  return (
    <div className='rounded-lg border bg-background/60 px-4 py-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='text-sm leading-snug'>
            <span className='mr-1 font-bold text-blue-600 dark:text-blue-400'>Q{questionNo}.</span>
            {text}
          </div>
        </div>
        <div className='shrink-0 text-right'>
          <div className={`text-2xl font-bold tabular-nums ${color.text}`}>
            {avg !== null ? avg.toFixed(2) : '-'}
          </div>
          <div className='text-[10px] text-muted-foreground'>{count}건</div>
        </div>
      </div>
      <div className='mt-3 space-y-1'>
        {distribution
          .map((c, i) => ({ score: i + 1, count: c }))
          .toReversed()
          .map(({ score, count: c }) => {
            const pct = (c / total) * 100;
            return (
              <div key={score} className='flex items-center gap-2 text-[11px]'>
                <span className='w-3 shrink-0 text-right text-muted-foreground'>{score}</span>
                <div className='relative h-2 flex-1 overflow-hidden rounded-full bg-muted'>
                  <div
                    className={`absolute inset-y-0 left-0 ${color.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className='w-7 shrink-0 text-right tabular-nums text-muted-foreground'>
                  {c}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function InstructorBlock({
  name,
  avg,
  count,
  distribution
}: {
  name: string;
  avg: number | null;
  count: number;
  distribution: number[];
}) {
  const total = distribution.reduce((a, b) => a + b, 0) || 1;
  const color = scoreColor(avg);
  return (
    <div className='rounded-lg border bg-background/60 px-4 py-3'>
      <div className='flex items-baseline justify-between'>
        <div className='text-sm font-bold'>{name}</div>
        <div className='text-xs text-muted-foreground'>응답 {count}건</div>
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${color.text}`}>
        {avg !== null ? avg.toFixed(2) : '-'}
        <span className='ml-1 text-xs font-normal text-muted-foreground'>/ 5</span>
      </div>
      <div className='mt-3 space-y-1'>
        {distribution
          .map((c, i) => ({ score: i + 1, count: c }))
          .toReversed()
          .map(({ score, count }) => {
            const pct = (count / total) * 100;
            return (
              <div key={score} className='flex items-center gap-2 text-[11px]'>
                <span className='w-3 shrink-0 text-right text-muted-foreground'>{score}</span>
                <div className='relative h-2 flex-1 overflow-hidden rounded-full bg-muted'>
                  <div
                    className={`absolute inset-y-0 left-0 ${color.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className='w-8 shrink-0 text-right tabular-nums text-muted-foreground'>
                  {count}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
