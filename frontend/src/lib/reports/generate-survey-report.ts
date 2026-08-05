// 만족도조사 결과보고서 파트1 LLM 요약 — 주요 성과·주관식 종합 요약·향후 개선 방향.
// 수치 요약(개요·점수)은 전부 rule-based, LLM은 해석 텍스트만 담당한다.

import OpenAI from 'openai';
import type { SurveyReportStats } from './survey-report-stats';

export const SURVEY_REPORT_MODEL = 'gpt-4o-mini';

export type SurveyReportSummary = {
  generated_at: string;
  model: string;
  /** ③ 주요 성과 — 굵은 리드 + 근거 문장 */
  key_findings: { title: string; body: string }[];
  /** ④ 주관식 종합 요약 */
  positive_tags: string[];
  positive_bullets: string[];
  suggestion_tags: string[];
  suggestion_bullets: string[];
  /** ⑤ 향후 개선 방향 */
  improvements: { title: string; body: string }[];
  /** 파트2 말미 '개선 참고 의견' */
  minor_feedback: string[];
};

const SUMMARY_SCHEMA = {
  name: 'survey_report_summary',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'key_findings',
      'positive_tags',
      'positive_bullets',
      'suggestion_tags',
      'suggestion_bullets',
      'improvements',
      'minor_feedback'
    ],
    properties: {
      key_findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'body'],
          properties: { title: { type: 'string' }, body: { type: 'string' } }
        }
      },
      positive_tags: { type: 'array', items: { type: 'string' } },
      positive_bullets: { type: 'array', items: { type: 'string' } },
      suggestion_tags: { type: 'array', items: { type: 'string' } },
      suggestion_bullets: { type: 'array', items: { type: 'string' } },
      improvements: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'body'],
          properties: { title: { type: 'string' }, body: { type: 'string' } }
        }
      },
      minor_feedback: { type: 'array', items: { type: 'string' } }
    }
  }
} as const;

const round2 = (n: number | null): string | null =>
  n === null ? null : (Math.round(n * 100) / 100).toFixed(2);

const SYSTEM_PROMPT = `공공기관 교육 만족도조사 결과보고서의 요약 파트를 작성한다. 간결한 보고서체(명사형·서술식 혼용, "~호평", "~평가", "~확인" 등)로 쓰고 평어체("~입니다")는 금지.

규칙:
- 수치는 입력 데이터의 값을 그대로 사용. 재계산·추측 금지.
- 개인 이름·소속이 서술형 인용에 보이면 강사명 외에는 [학습자]로 마스킹. 비방·욕설은 제외.
- key_findings: 정확히 3개. title은 "강사 만족도 최고 수준(9.28)"처럼 굵은 리드용 짧은 구, body는 문항 번호·수치를 인용한 근거 1~2문장.
- positive_tags / suggestion_tags: 각 3~4개, '#' 없이 짧은 키워드 (예: "실습중심", "실무활용").
- positive_bullets: 긍정 서술형 응답을 종합한 대표 문장 3개.
- suggestion_bullets: 건설적 제언을 종합한 대표 문장 3개.
- improvements: 정확히 3개. title은 "실시간 편성 비중 확대"처럼 개선 과제명, body는 근거(수치·의견)와 기대 효과를 담은 1~2문장.
- minor_feedback: 소수의 불만·개선 요청을 건설적 표현으로 다듬은 문장 0~5개. 없으면 빈 배열.
- 서술형 응답이 아예 없으면 positive/suggestion bullets는 척도 결과 기반으로 간략히 작성.`;

export async function generateSurveyReportSummary(
  stats: SurveyReportStats
): Promise<SurveyReportSummary> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. frontend/.env.local에 추가하세요.');
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const payload = {
    cohort: stats.cohortName,
    survey_title: stats.surveyTitle,
    respondents: stats.submittedCount,
    total_students: stats.totalStudents,
    response_rate: stats.responseRate,
    overall_avg: round2(stats.overallAvg),
    recommend: stats.recommend
      ? {
          question_no: stats.recommend.questionNo,
          avg: round2(stats.recommend.avg),
          top_count: stats.recommend.topCount,
          top_pct: stats.recommend.topPct
        }
      : null,
    sections: stats.sections.map((s) => ({
      no: s.sectionNo,
      title: s.title,
      instructor: s.instructorName,
      avg: round2(s.avg),
      n: s.count
    })),
    questions: stats.questions.map((q) => ({
      no: q.questionNo,
      section_no: q.sectionNo,
      text: q.text,
      avg: round2(q.avg),
      n: q.count,
      distribution: q.distribution
    })),
    // 서술형은 문항당 최대 60건으로 캡 (토큰 한도 보호)
    narrative: stats.narrative.map((g) => ({
      no: g.questionNo,
      question: g.text,
      answers: g.answers.slice(0, 60)
    })),
    dissatisfaction_reasons: stats.followUps.map((g) => ({
      no: g.questionNo,
      linked_question: g.linkedText,
      answers: g.answers.slice(0, 30)
    }))
  };

  const completion = await client.chat.completions.create({
    model: SURVEY_REPORT_MODEL,
    temperature: 0.3,
    max_completion_tokens: 4000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    response_format: { type: 'json_schema', json_schema: SUMMARY_SCHEMA }
  });

  if (completion.choices[0]?.finish_reason === 'length') {
    throw new Error('LLM 요약 출력이 토큰 한도에 도달함.');
  }
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI 응답이 비어 있음.');

  const parsed = JSON.parse(raw) as Omit<SurveyReportSummary, 'generated_at' | 'model'>;
  if (parsed.key_findings.length === 0 || parsed.improvements.length === 0) {
    throw new Error('LLM 요약이 필수 항목을 채우지 못함.');
  }

  return {
    generated_at: new Date().toISOString(),
    model: SURVEY_REPORT_MODEL,
    ...parsed
  };
}
