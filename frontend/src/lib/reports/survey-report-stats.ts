// 만족도조사 결과보고서용 통계 집계 — 결과 페이지(results-view.tsx)와 동일 규칙.
// 보고서 파트1(요약)과 LLM 입력에 함께 쓴다. 종합 만족도는 샘플 보고서 정의대로
// "척도 문항 평균들의 평균" (문항별 응답수 가중 아님).

import { createAdminClient } from '@/lib/supabase/server';
import { computeFollowUpMap } from '@/lib/survey-display';

export type SurveyQuestionStat = {
  id: string;
  questionNo: number;
  text: string;
  sectionNo: number;
  sectionTitle: string;
  instructorName: string | null;
  avg: number | null;
  count: number;
  distribution: number[]; // index 0 = 1점 … index 9 = 10점
};

export type SurveySectionStat = {
  sectionNo: number;
  title: string;
  instructorName: string | null;
  avg: number | null;
  count: number;
};

export type SurveyTextGroup = {
  questionNo: number;
  text: string;
  /** follow-up(불만족 사유)이면 연결된 척도 문항 텍스트 */
  linkedText: string | null;
  answers: string[];
};

export type SurveyReportStats = {
  surveyId: string;
  surveyTitle: string;
  cohortName: string;
  deliveryMethod: string | null;
  instructorNames: string[];
  totalStudents: number;
  submittedCount: number;
  /** 0~100, 소수 1자리 */
  responseRate: number;
  scaleResponseCount: number;
  likertQuestionCount: number;
  overallAvg: number | null;
  recommend: { questionNo: number; avg: number | null; topCount: number; topPct: number } | null;
  sections: SurveySectionStat[];
  questions: SurveyQuestionStat[];
  narrative: SurveyTextGroup[];
  followUps: SurveyTextGroup[];
};

type Stat = { count: number; sum: number; distribution: number[] };
const emptyStat = (): Stat => ({ count: 0, sum: 0, distribution: Array(10).fill(0) as number[] });
const push = (s: Stat, v: number) => {
  s.count++;
  s.sum += v;
  if (v >= 1 && v <= 10) s.distribution[v - 1]++;
};
const avgOf = (s: Stat): number | null => (s.count > 0 ? s.sum / s.count : null);

export async function loadSurveyReportStats(
  cohortId: string,
  surveyId: string
): Promise<SurveyReportStats | null> {
  const supabase = createAdminClient();

  const [surveyRes, questionsRes, responsesRes, cohortRes] = await Promise.all([
    supabase
      .from('surveys')
      .select('id, title, respondent_total, cohort_id, additional_cohort_ids')
      .eq('id', surveyId)
      .maybeSingle(),
    supabase
      .from('survey_questions')
      .select('id, question_no, type, text, section_no, section_title, instructor_id')
      .eq('survey_id', surveyId)
      .order('question_no', { ascending: true }),
    supabase
      .from('survey_responses')
      .select('id, responses')
      .eq('survey_id', surveyId)
      .not('submitted_at', 'is', null),
    supabase.from('cohorts').select('id, name, delivery_method').eq('id', cohortId).maybeSingle()
  ]);

  const survey = surveyRes.data;
  const cohort = cohortRes.data;
  if (!survey || !cohort || !questionsRes.data) return null;

  const appliedCohortIds = Array.from(
    new Set([survey.cohort_id, ...(survey.additional_cohort_ids ?? [])])
  );
  if (!appliedCohortIds.includes(cohortId)) return null;

  const questions = questionsRes.data;
  const submitted = responsesRes.data ?? [];

  let totalStudents = survey.respondent_total ?? null;
  if (totalStudents === null) {
    const { count } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .in('cohort_id', appliedCohortIds)
      .not('name', 'ilike', '테스트%');
    totalStudents = count ?? 0;
  }

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

  const followUpMap = computeFollowUpMap(questions);

  const byQuestion = new Map<string, Stat>();
  const texts = new Map<string, string[]>();
  let scaleResponseCount = 0;

  for (const r of submitted) {
    const obj = (r.responses ?? {}) as Record<string, unknown>;
    for (const q of questions) {
      const v = obj[q.id];
      if (v === undefined || v === null || v === '') continue;
      if (q.type === 'likert10' && typeof v === 'number') {
        if (!byQuestion.has(q.id)) byQuestion.set(q.id, emptyStat());
        push(byQuestion.get(q.id)!, v);
        scaleResponseCount++;
      } else if (q.type === 'text' && typeof v === 'string' && v.trim().length > 0) {
        if (!texts.has(q.id)) texts.set(q.id, []);
        texts.get(q.id)!.push(v.trim());
      }
    }
  }

  const likertQuestions = questions.filter((q) => q.type === 'likert10');
  const questionStats: SurveyQuestionStat[] = likertQuestions.map((q) => {
    const s = byQuestion.get(q.id) ?? emptyStat();
    return {
      id: q.id,
      questionNo: q.question_no,
      text: q.text,
      sectionNo: q.section_no ?? 0,
      sectionTitle: q.section_title ?? `섹션 ${q.section_no ?? 0}`,
      instructorName: q.instructor_id ? (instructorNameById.get(q.instructor_id) ?? null) : null,
      avg: avgOf(s),
      count: s.count,
      distribution: s.distribution
    };
  });

  // 섹션 통계 — 섹션 내 전체 응답 pooled 평균 (결과 페이지와 동일)
  const bySection = new Map<number, { title: string; instructorName: string | null; stat: Stat }>();
  for (const q of likertQuestions) {
    const sec = q.section_no ?? 0;
    if (!bySection.has(sec)) {
      bySection.set(sec, {
        title: q.section_title ?? `섹션 ${sec}`,
        instructorName: q.instructor_id ? (instructorNameById.get(q.instructor_id) ?? null) : null,
        stat: emptyStat()
      });
    }
    const s = byQuestion.get(q.id);
    if (s) {
      const target = bySection.get(sec)!.stat;
      target.count += s.count;
      target.sum += s.sum;
      for (let i = 0; i < 10; i++) target.distribution[i] += s.distribution[i];
    }
  }
  const sections: SurveySectionStat[] = Array.from(bySection.entries())
    .toSorted((a, b) => a[0] - b[0])
    .map(([no, v]) => ({
      sectionNo: no,
      title: v.title.replace(/ — \[.+?\] \d+회차$/, ''),
      instructorName: v.instructorName,
      avg: avgOf(v.stat),
      count: v.stat.count
    }));

  // 종합 만족도 = 응답 있는 척도 문항 평균들의 평균
  const answeredAvgs = questionStats.map((q) => q.avg).filter((a): a is number => a !== null);
  const overallAvg =
    answeredAvgs.length > 0 ? answeredAvgs.reduce((a, b) => a + b, 0) / answeredAvgs.length : null;

  const recommendQ = likertQuestions.find((q) => q.section_no === 1 && q.text.includes('추천'));
  let recommend: SurveyReportStats['recommend'] = null;
  if (recommendQ) {
    const s = byQuestion.get(recommendQ.id) ?? emptyStat();
    const topCount = s.distribution[9];
    recommend = {
      questionNo: recommendQ.question_no,
      avg: avgOf(s),
      topCount,
      topPct: s.count > 0 ? Math.round((topCount / s.count) * 1000) / 10 : 0
    };
  }

  const questionTextById = new Map(questions.map((q) => [q.id, q.text] as const));
  const narrative: SurveyTextGroup[] = questions
    .filter((q) => q.type === 'text' && !followUpMap.has(q.id))
    .map((q) => ({
      questionNo: q.question_no,
      text: q.text,
      linkedText: null,
      answers: texts.get(q.id) ?? []
    }));
  const followUps: SurveyTextGroup[] = questions
    .filter((q) => q.type === 'text' && followUpMap.has(q.id))
    .map((q) => ({
      questionNo: q.question_no,
      text: q.text,
      linkedText: questionTextById.get(followUpMap.get(q.id)!) ?? null,
      answers: texts.get(q.id) ?? []
    }))
    .filter((g) => g.answers.length > 0);

  return {
    surveyId: survey.id,
    surveyTitle: survey.title,
    cohortName: cohort.name,
    deliveryMethod: cohort.delivery_method,
    instructorNames: Array.from(new Set(instructorNameById.values())),
    totalStudents,
    submittedCount: submitted.length,
    responseRate:
      totalStudents > 0 ? Math.round((submitted.length / totalStudents) * 1000) / 10 : 0,
    scaleResponseCount,
    likertQuestionCount: likertQuestions.length,
    overallAvg,
    recommend,
    sections,
    questions: questionStats,
    narrative,
    followUps
  };
}
