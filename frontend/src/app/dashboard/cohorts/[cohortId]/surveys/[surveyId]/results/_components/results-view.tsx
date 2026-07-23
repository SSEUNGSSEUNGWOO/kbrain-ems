import { createAdminClient } from '@/lib/supabase/server';
import { computeFollowUpMap } from '@/lib/survey-display';
import { notFound } from 'next/navigation';
import { DeletableTextItem } from './deletable-text-item';
import { IndividualResponses, type QuestionInfo, type ResponseRow } from './individual-responses';
import { SectionAverageChart } from './section-average-chart';

type LikertStat = {
  count: number;
  sum: number;
  avg: number | null;
  distribution: number[]; // index 0 = score 1, .. index 9 = score 10
};

function emptyStat(): LikertStat {
  return { count: 0, sum: 0, avg: null, distribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
}

function pushScore(stat: LikertStat, v: number) {
  stat.count++;
  stat.sum += v;
  if (v >= 1 && v <= 10) stat.distribution[v - 1]++;
}

function finalize(stat: LikertStat) {
  stat.avg = stat.count > 0 ? stat.sum / stat.count : null;
}

type Props = {
  cohortId: string;
  surveyId: string;
  /** 인쇄·공개 페이지용으로 항상 보이는 보고 헤더 (cohort명 · 설문 제목 · 응답률) */
  showReportHeader?: boolean;
  /** 서술형·사유 응답에 hover 삭제 버튼 노출 여부. 공개 공유 링크에서는 false. */
  canDelete?: boolean;
};

export async function ResultsView({
  cohortId,
  surveyId,
  showReportHeader = false,
  canDelete = true
}: Props) {
  const supabase = createAdminClient();

  const [surveyRes, questionsRes, responsesRes, cohortRes] = await Promise.all([
    supabase
      .from('surveys')
      .select(
        'id, title, share_code, opens_at, respondent_total, cohort_id, additional_cohort_ids'
      )
      .eq('id', surveyId)
      .maybeSingle(),
    supabase
      .from('survey_questions')
      .select('id, question_no, type, text, section_no, section_title, instructor_id')
      .eq('survey_id', surveyId)
      .order('question_no', { ascending: true }),
    supabase
      .from('survey_responses')
      .select('id, responses, submitted_at')
      .eq('survey_id', surveyId)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: true }),
    supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle()
  ]);

  if (!surveyRes.data || !questionsRes.data || !cohortRes.data) notFound();
  const survey = surveyRes.data;
  // 이 설문이 적용되는 cohort 집합 — primary + additional. 통합 설문이면 어느
  // 쪽 cohort URL 로 들어와도 접근 허용.
  const appliedCohortIds = Array.from(
    new Set([survey.cohort_id, ...(survey.additional_cohort_ids ?? [])])
  );
  if (!appliedCohortIds.includes(cohortId)) notFound();

  const questions = questionsRes.data;
  const submitted = responsesRes.data ?? [];

  // 분모 — survey.respondent_total 직접 설정값 우선, 없으면 적용 cohort 학생 합 (테스트 제외)
  let totalStudents = survey.respondent_total ?? null;
  if (totalStudents === null) {
    const { count } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .in('cohort_id', appliedCohortIds)
      .not('name', 'ilike', '테스트%');
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
  const byQuestion = new Map<string, LikertStat>();

  const recommendQ = questions.find(
    (q) => q.type === 'likert10' && q.section_no === 1 && q.text.includes('추천')
  );
  const recommendStat = emptyStat();

  type TextEntry = {
    responseId: string;
    questionId: string;
    text: string;
    submittedAt: string | null;
  };
  const narrativeTexts = new Map<string, TextEntry[]>();
  const followUpTexts = new Map<string, { linked: string; entries: TextEntry[] }>();

  const followUpMap = computeFollowUpMap(questions);
  // 원본 question_no를 그대로 표시 — xlsx export와 번호 일치
  const questionNoById = new Map(questions.map((q) => [q.id, q.question_no] as const));
  const getDisplayNo = (id: string) => String(questionNoById.get(id) ?? '?');

  for (const r of submitted) {
    const obj = (r.responses ?? {}) as Record<string, unknown>;
    // 이 응답자가 각 강사에 대해 답한 문항 값들 (응답자별 강사 평균 계산용)
    const perRespondentInstructorScores = new Map<string, number[]>();

    for (const q of questions) {
      const v = obj[q.id];
      if (v === undefined || v === null || v === '') continue;

      if (q.type === 'likert10' && typeof v === 'number') {
        pushScore(overall, v);

        const sec = q.section_no ?? 0;
        if (!bySectionNo.has(sec)) {
          bySectionNo.set(sec, { title: q.section_title ?? `섹션 ${sec}`, stat: emptyStat() });
        }
        pushScore(bySectionNo.get(sec)!.stat, v);

        if (q.instructor_id) {
          if (!perRespondentInstructorScores.has(q.instructor_id)) {
            perRespondentInstructorScores.set(q.instructor_id, []);
          }
          perRespondentInstructorScores.get(q.instructor_id)!.push(v);
        }

        if (!byQuestion.has(q.id)) byQuestion.set(q.id, emptyStat());
        pushScore(byQuestion.get(q.id)!, v);

        if (recommendQ && q.id === recommendQ.id) pushScore(recommendStat, v);
      } else if (q.type === 'text' && typeof v === 'string' && v.trim().length > 0) {
        const entry: TextEntry = {
          responseId: r.id,
          questionId: q.id,
          text: v.trim(),
          submittedAt: r.submitted_at
        };
        if (q.section_title === '서술형') {
          if (!narrativeTexts.has(q.id)) narrativeTexts.set(q.id, []);
          narrativeTexts.get(q.id)!.push(entry);
        } else if (followUpMap.has(q.id)) {
          if (!followUpTexts.has(q.id)) {
            followUpTexts.set(q.id, { linked: followUpMap.get(q.id)!, entries: [] });
          }
          followUpTexts.get(q.id)!.entries.push(entry);
        }
      }
    }

    // 응답자별 강사 문항 평균을 강사 stat에 push (응답 건수 = 응답자 수)
    for (const [instructorId, vals] of perRespondentInstructorScores) {
      if (vals.length === 0) continue;
      if (!byInstructorId.has(instructorId)) {
        byInstructorId.set(instructorId, {
          name: instructorNameById.get(instructorId) ?? '강사',
          stat: emptyStat()
        });
      }
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const rounded = Math.round(avg);
      const stat = byInstructorId.get(instructorId)!.stat;
      stat.count++;
      stat.sum += avg;
      if (rounded >= 1 && rounded <= 10) stat.distribution[rounded - 1]++;
    }
  }

  finalize(overall);
  for (const v of bySectionNo.values()) finalize(v.stat);
  for (const v of byInstructorId.values()) finalize(v.stat);
  for (const v of byQuestion.values()) finalize(v);
  finalize(recommendStat);

  const responseRate =
    totalStudents > 0 ? Math.round((submitted.length / totalStudents) * 100) : 0;

  const sectionChartData = Array.from(bySectionNo.entries())
    .toSorted((a, b) => a[0] - b[0])
    .map(([no, v]) => {
      // 섹션 라벨: 강사 만족도의 경우 강사명까지, 그 외는 섹션 제목 전체
      const cleanedTitle = v.title.replace(/ — \[.+?\] \d+회차$/, '');
      return {
        name: `${no}. ${cleanedTitle}`,
        평균: Number(v.stat.avg?.toFixed(2) ?? 0),
        응답수: v.stat.count
      };
    });

  const instructorCards = Array.from(byInstructorId.entries()).map(([id, v]) => ({
    id,
    name: v.name,
    avg: v.stat.avg,
    count: v.stat.count,
    distribution: v.stat.distribution
  }));

  const likertQuestions = questions.filter((q) => q.type === 'likert10');
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

  // 서술형 = 서술형 섹션 문항 + follow-up 아닌 독립 text 문항 (원본 Q19 등)
  const narrativeQuestions = questions.filter(
    (q) => q.type === 'text' && !followUpMap.has(q.id)
  );

  const followUpQuestions = questions.filter((q) => followUpMap.has(q.id));

  const individualQuestions: QuestionInfo[] = questions
    .filter((q) => q.type === 'likert10' || q.type === 'text')
    .map((q) => ({
      id: q.id,
      displayNo: getDisplayNo(q.id),
      type: q.type as 'likert10' | 'text',
      text: q.text,
      sectionNo: q.section_no ?? 0,
      sectionTitle: q.section_title ?? `섹션 ${q.section_no ?? 0}`,
      instructorName: q.instructor_id ? instructorNameById.get(q.instructor_id) ?? null : null,
      isFollowUp: followUpMap.has(q.id)
    }));

  const individualRows: ResponseRow[] = submitted
    .filter((r): r is typeof r & { submitted_at: string } => !!r.submitted_at)
    .map((r, idx) => {
      const obj = (r.responses ?? {}) as Record<string, unknown>;
      const answers: Record<string, number | string> = {};
      let sum = 0;
      let cnt = 0;
      for (const q of questions) {
        const v = obj[q.id];
        if (v === undefined || v === null || v === '') continue;
        if (q.type === 'likert10' && typeof v === 'number') {
          answers[q.id] = v;
          sum += v;
          cnt++;
        } else if (q.type === 'text' && typeof v === 'string') {
          answers[q.id] = v;
        }
      }
      return {
        no: idx + 1,
        submittedAt: r.submitted_at,
        avg: cnt > 0 ? sum / cnt : null,
        likertCount: cnt,
        answers
      };
    });

  const printedAt = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return (
    <div className='max-w-4xl space-y-6 print:max-w-none print:space-y-3'>
      {/* 표지 페이지 — 공개/인쇄 페이지에서만 노출. 인쇄 시 다음 콘텐츠는 새 페이지에서 시작 */}
      {showReportHeader ? (
        <div className='flex min-h-[75vh] flex-col justify-between border-b pb-6 print:min-h-[240mm] print:border-0 print:pb-0 print:break-after-page'>
          <div className='pt-4 print:pt-8'>
            <div className='text-xs font-semibold tracking-wider text-blue-600 uppercase'>
              Kbrain · 교육 결과 보고서
            </div>
            <div className='mt-2 text-sm text-slate-500'>{cohortRes.data.name}</div>
          </div>

          <div className='flex-1 py-10'>
            <div className='text-[13px] font-medium text-slate-500'>만족도 조사 결과보고</div>
            <h1 className='mt-2 text-3xl leading-tight font-black text-slate-900 print:text-4xl'>
              {survey.title}
            </h1>
            <div className='mt-8 grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-slate-700'>
              <div>
                <div className='text-[11px] font-semibold tracking-wider text-slate-500 uppercase'>교육 기수</div>
                <div className='mt-0.5 font-semibold'>{cohortRes.data.name}</div>
              </div>
              <div>
                <div className='text-[11px] font-semibold tracking-wider text-slate-500 uppercase'>응답 현황</div>
                <div className='mt-0.5 font-semibold'>
                  {submitted.length}명 응답 · 응답률 {responseRate}%
                </div>
              </div>
              <div>
                <div className='text-[11px] font-semibold tracking-wider text-slate-500 uppercase'>척도</div>
                <div className='mt-0.5 font-semibold'>10점 척도</div>
              </div>
              <div>
                <div className='text-[11px] font-semibold tracking-wider text-slate-500 uppercase'>출력일</div>
                <div className='mt-0.5 font-semibold'>{printedAt}</div>
              </div>
            </div>
          </div>

          <div className='border-t border-slate-200 pt-3 text-[11px] text-slate-500'>
            본 보고서는 응답자 익명 원칙에 따라 개인 식별 정보를 포함하지 않습니다.
          </div>
        </div>
      ) : (
        // 운영자 대시보드 페이지 — 인쇄 시에만 컴팩트 헤더 노출
        <div className='hidden border-b pb-3 print:block'>
          <div className='text-xs text-slate-500'>{cohortRes.data.name}</div>
          <div className='mt-0.5 text-base font-bold text-slate-900'>
            {survey.title} · 만족도 조사 결과보고
          </div>
          <div className='mt-0.5 text-[11px] text-slate-500'>
            응답률 {responseRate}% ({submitted.length} / {totalStudents}명) · 출력일 {printedAt}
          </div>
        </div>
      )}

      {/* KPI */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <Kpi
          label='전체 평균'
          value={overall.avg !== null ? overall.avg.toFixed(2) : '-'}
          unit='/ 10'
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
          unit='/ 10'
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

      {sectionChartData.length > 0 && (
        <section className='rounded-xl border bg-card px-6 py-5 shadow-sm print:rounded-none print:border-0 print:px-0 print:py-2 print:shadow-none print:break-inside-avoid-page'>
          <h2 className='mb-1 text-sm font-bold'>섹션별 평균</h2>
          <p className='mb-4 text-xs text-muted-foreground'>각 섹션의 척도 문항 평균 (10점 만점)</p>
          <SectionAverageChart data={sectionChartData} />
        </section>
      )}

      {likertQuestions.length > 0 && (
        <section className='rounded-xl border bg-card px-6 py-5 shadow-sm print:rounded-none print:border-0 print:px-0 print:py-2 print:shadow-none print:break-inside-avoid-page'>
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

      {instructorCards.length > 1 && (
        <section className='rounded-xl border bg-card px-6 py-5 shadow-sm print:rounded-none print:border-0 print:px-0 print:py-2 print:shadow-none print:break-inside-avoid-page'>
          <h2 className='mb-4 text-sm font-bold'>강사 만족도 비교</h2>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            {instructorCards.map((i) => (
              <InstructorBlock key={i.id} {...i} />
            ))}
          </div>
        </section>
      )}

      {narrativeQuestions.length > 0 && (
        <section className='rounded-xl border bg-card px-6 py-5 shadow-sm print:rounded-none print:border-0 print:px-0 print:py-2 print:shadow-none print:break-inside-avoid-page'>
          <h2 className='mb-4 text-sm font-bold'>서술형 응답</h2>
          <div className='space-y-5'>
            {narrativeQuestions.map((q) => {
              const entries = narrativeTexts.get(q.id) ?? [];
              return (
                <div key={q.id}>
                  <h3 className='mb-2 text-xs font-semibold text-muted-foreground'>
                    Q{getDisplayNo(q.id)}. {q.text}
                  </h3>
                  {entries.length === 0 ? (
                    <p className='text-xs text-muted-foreground'>응답 없음</p>
                  ) : (
                    <ul className='space-y-2 print:[&_button]:hidden'>
                      {entries.map((e) =>
                        canDelete ? (
                          <DeletableTextItem
                            key={`${e.responseId}:${e.questionId}`}
                            cohortId={cohortId}
                            surveyId={surveyId}
                            responseId={e.responseId}
                            questionId={e.questionId}
                            text={e.text}
                          />
                        ) : (
                          <li
                            key={`${e.responseId}:${e.questionId}`}
                            className='whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm'
                          >
                            {e.text}
                          </li>
                        )
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {followUpQuestions.length > 0 && (
        <section className='rounded-xl border bg-card px-6 py-5 shadow-sm print:rounded-none print:border-0 print:px-0 print:py-2 print:shadow-none print:break-inside-avoid-page'>
          <h2 className='mb-1 text-sm font-bold'>불만족·개선 사유</h2>
          <p className='mb-4 text-xs text-muted-foreground'>
            척도 문항별로 응답자가 직접 남긴 개선 사유 응답
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
                  <ul className='space-y-2 print:[&_button]:hidden'>
                    {entries.map((e) =>
                      canDelete ? (
                        <DeletableTextItem
                          key={`${e.responseId}:${e.questionId}`}
                          cohortId={cohortId}
                          surveyId={surveyId}
                          responseId={e.responseId}
                          questionId={e.questionId}
                          text={e.text}
                          className='border-amber-200/60 bg-amber-50/40 dark:border-amber-900/30 dark:bg-amber-900/10'
                        />
                      ) : (
                        <li
                          key={`${e.responseId}:${e.questionId}`}
                          className='whitespace-pre-wrap rounded-md border border-amber-200/60 bg-amber-50/40 px-3 py-2 text-sm dark:border-amber-900/30 dark:bg-amber-900/10'
                        >
                          {e.text}
                        </li>
                      )
                    )}
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

      {/* 개별 응답 — Sheet 기반 클라이언트 컴포넌트라 인쇄에서는 제외 */}
      <div className='print:hidden'>
        <IndividualResponses rows={individualRows} questions={individualQuestions} />
      </div>
    </div>
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

function scoreColor(avg: number | null): { text: string; bar: string } {
  if (avg === null) return { text: 'text-muted-foreground', bar: 'bg-muted' };
  if (avg >= 9.0) return { text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' };
  if (avg >= 8.0) return { text: 'text-blue-700 dark:text-blue-300', bar: 'bg-blue-500' };
  if (avg >= 7.0) return { text: 'text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' };
  if (avg >= 6.0) return { text: 'text-orange-700 dark:text-orange-300', bar: 'bg-orange-500' };
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
            const isZero = c === 0;
            return (
              <div key={score} className={`flex items-center gap-2 text-[11px] ${isZero ? 'opacity-40' : ''}`}>
                <span className='w-5 shrink-0 text-right tabular-nums text-muted-foreground'>{score}</span>
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
        <span className='ml-1 text-xs font-normal text-muted-foreground'>/ 10</span>
      </div>
      <div className='mt-3 space-y-1'>
        {distribution
          .map((c, i) => ({ score: i + 1, count: c }))
          .toReversed()
          .map(({ score, count }) => {
            const pct = (count / total) * 100;
            const isZero = count === 0;
            return (
              <div key={score} className={`flex items-center gap-2 text-[11px] ${isZero ? 'opacity-40' : ''}`}>
                <span className='w-5 shrink-0 text-right tabular-nums text-muted-foreground'>{score}</span>
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
