// 회차 결과보고서 — 개요/출석/표는 rule-based, 분석 멘트만 OpenAI gpt-4o-mini.
// 만족도 섹션은 chunk로 쪼개 병렬 LLM 호출 (종합 분석 1 + 영역별 N + 강사별 M + 서술형 1).
// 응답 분포 표는 distribution 배열에서 직접 빌드.

import OpenAI from 'openai';
import type { SessionReportData } from './session-data';

type SurveyQuestion = SessionReportData['surveys'][number]['questions'][number];

export type ReportBlock =
  | { kind: 'text'; body: string }
  | { kind: 'table'; caption?: string | null; headers: string[]; rows: string[][] };

export type ReportSection = {
  id: 'overview' | 'attendance' | 'satisfaction';
  title: string;
  blocks: ReportBlock[];
};

export type SessionReportContent = {
  generated_at: string;
  model: string;
  sections: ReportSection[];
};

export const SESSION_REPORT_MODEL = 'gpt-4o-mini';

const round2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

// ── 1) 개요 섹션 (rule-based) ────────────────────────────────────────────────
export function buildOverviewSection(data: SessionReportData): ReportSection {
  const s = data.session;
  const lines: string[] = [];
  lines.push(`○ 과정명: ${s.cohort_name}${s.cohort_category ? ` (${s.cohort_category})` : ''}`);
  if (s.no !== null) lines.push(`○ 회차: ${s.no}회차${s.title ? ` — ${s.title}` : ''}`);
  else if (s.title) lines.push(`○ 회차 주제: ${s.title}`);
  if (s.date) lines.push(`○ 일자: ${s.date}`);
  if (s.start_time && s.end_time) {
    const breakPart = s.break_minutes ? ` (휴식 ${s.break_minutes}분 포함` : '';
    const totalPart =
      s.total_hours_planned !== null
        ? `${breakPart ? ', ' : ' ('}총 ${s.total_hours_planned}시간)`
        : breakPart
          ? ')'
          : '';
    lines.push(`○ 시간: ${s.start_time} ~ ${s.end_time}${breakPart}${totalPart}`);
  }
  lines.push(`○ 장소: ${s.location ?? '미지정'}`);
  lines.push(`○ 교육대상: 총 ${data.attendance.total}명`);

  return {
    id: 'overview',
    title: '1. 회차 개요',
    blocks: [{ kind: 'text', body: lines.join('\n') }]
  };
}

// ── 2) 출석 섹션 (rule-based) ────────────────────────────────────────────────
export function buildAttendanceSection(data: SessionReportData): ReportSection {
  const a = data.attendance;
  if (a.total === 0) {
    return {
      id: 'attendance',
      title: '2. 출석',
      blocks: [{ kind: 'text', body: '출결 미입력' }]
    };
  }
  const summary = `○ 참석률: ${a.rate ?? '-'}% (${a.present}/${a.total})\n○ 미참석자: ${a.absent}명`;
  const blocks: ReportBlock[] = [{ kind: 'text', body: summary }];
  if (a.absentees.length > 0) {
    const statusLabel: Record<string, string> = {
      absent: '결석',
      late: '지각',
      early_leave: '조퇴',
      excused: '공결'
    };
    blocks.push({
      kind: 'table',
      caption: '미참석자 명단',
      headers: ['이름', '소속', '상태', '비고'],
      rows: a.absentees.map((x) => [
        x.name ?? '-',
        x.organization ?? '-',
        statusLabel[x.status] ?? x.status,
        x.note ?? '-'
      ])
    });
  }
  return { id: 'attendance', title: '2. 출석', blocks };
}

// ── 3) 만족도 — 보조 함수들 ─────────────────────────────────────────────────

type AreaGroup = {
  title: string;
  questions: SurveyQuestion[];
  avg: number;
  totalN: number;
};

type InstructorGroup = {
  instructor_id: string;
  instructor_name: string | null;
  questions: SurveyQuestion[];
  avg: number;
  totalN: number;
  category: string; // "특강 강사 만족도" 등
};

function isLikert(q: SurveyQuestion): boolean {
  return q.type === 'likert5' || q.type === 'likert10';
}

function avgOf(questions: SurveyQuestion[]): { avg: number; totalN: number; sum: number } {
  let sum = 0;
  let totalN = 0;
  for (const q of questions) {
    if (q.avg !== null && q.n !== null && q.n > 0) {
      sum += q.avg * q.n;
      totalN += q.n;
    }
  }
  return { avg: totalN > 0 ? sum / totalN : 0, totalN, sum };
}

function groupByArea(survey: SessionReportData['surveys'][number]): AreaGroup[] {
  const byTitle = new Map<string, SurveyQuestion[]>();
  for (const q of survey.questions) {
    if (!isLikert(q)) continue;
    if (q.instructor_id) continue; // 강사 문항은 영역에서 제외
    const key = q.section_title ?? '기타';
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key)!.push(q);
  }
  const areas: AreaGroup[] = [];
  for (const [title, questions] of byTitle) {
    const { avg, totalN } = avgOf(questions);
    areas.push({ title, questions, avg, totalN });
  }
  return areas;
}

function groupByInstructor(survey: SessionReportData['surveys'][number]): InstructorGroup[] {
  const byInst = new Map<string, SurveyQuestion[]>();
  for (const q of survey.questions) {
    if (!isLikert(q)) continue;
    if (!q.instructor_id) continue;
    if (!byInst.has(q.instructor_id)) byInst.set(q.instructor_id, []);
    byInst.get(q.instructor_id)!.push(q);
  }
  const groups: InstructorGroup[] = [];
  let idx = 0;
  for (const [iid, questions] of byInst) {
    const { avg, totalN } = avgOf(questions);
    const name = questions.find((q) => q.instructor_name)?.instructor_name ?? null;
    // 카테고리는 첫 문항의 section_title에서 추론
    const sectionTitle = questions.find((q) => q.section_title)?.section_title;
    const category = sectionTitle ? `${sectionTitle}` : `강사 ${++idx} 만족도`;
    groups.push({ instructor_id: iid, instructor_name: name, questions, avg, totalN, category });
  }
  return groups;
}

function buildAreaSummaryTable(
  areas: AreaGroup[],
  instructorGroups: InstructorGroup[]
): ReportBlock {
  const rows: string[][] = areas.map((a) => [a.title, round2(a.avg), String(a.totalN)]);
  for (const g of instructorGroups) {
    const label = g.instructor_name ? `${g.category} (${g.instructor_name})` : g.category;
    rows.push([label, round2(g.avg), String(g.totalN)]);
  }
  return {
    kind: 'table',
    headers: ['영역', '평균(점)', '응답수(명)'],
    rows
  };
}

function buildDistributionTable(q: SurveyQuestion): ReportBlock {
  const dist = q.distribution ?? [];
  const scaleMax = q.type === 'likert10' ? 10 : q.type === 'likert5' ? 5 : dist.length;
  const headers = [
    '점수',
    ...Array.from({ length: scaleMax }, (_, i) => String(i + 1)),
    '평균',
    '응답수'
  ];
  const row = [
    '응답수',
    ...Array.from({ length: scaleMax }, (_, i) => String(dist[i] ?? 0)),
    q.avg !== null ? round2(q.avg) : '-',
    q.n !== null ? String(q.n) : '-'
  ];
  return { kind: 'table', headers, rows: [row] };
}

function buildQuestionLabel(parentNo: string, idx: number, q: SurveyQuestion): ReportBlock {
  const avg = q.avg !== null ? `(${round2(q.avg)}점)` : '';
  return {
    kind: 'text',
    body: `${parentNo}-${idx}. ${q.text} ${avg}의 응답 분포는 다음과 같음.`
  };
}

// ── 4) LLM 호출 (분석 멘트 전용) ────────────────────────────────────────────

function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. frontend/.env.local에 추가하세요.');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const ANALYSIS_SCHEMA = {
  name: 'analysis_blocks',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['blocks'],
    properties: {
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['body'],
          properties: { body: { type: 'string' } }
        }
      }
    }
  }
} as const;

const ANALYSIS_BASE_RULES = `행정안전부 'AI 친화적 행정문서 작성 가이드라인' 준수.
- 음슴체: "...임", "...함", "...됨", "...로 나타남", "...로 분석됨"으로 끝맺음. 평어체 금지.
- 서술식: 주어·서술어 명확. 개조식 지양.
- 수치는 입력 데이터에서 그대로 사용. 추측·재계산 금지.
- 개인 이름·소속이 인용에 보이면 [학습자]로, 비방·욕설은 [비방성 의견]으로 마스킹.`;

async function callForBlocks(
  systemPrompt: string,
  payload: unknown,
  expectedMin: number = 1
): Promise<string[]> {
  const client = openai();
  const completion = await client.chat.completions.create({
    model: SESSION_REPORT_MODEL,
    temperature: 0.3,
    max_completion_tokens: 4000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(payload) }
    ],
    response_format: { type: 'json_schema', json_schema: ANALYSIS_SCHEMA }
  });

  const finish = completion.choices[0]?.finish_reason;
  if (finish === 'length') throw new Error('LLM 분석 멘트 출력이 토큰 한도에 도달함.');

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI 응답이 비어 있음.');

  const parsed = JSON.parse(raw) as { blocks: { body: string }[] };
  if (parsed.blocks.length < expectedMin) {
    throw new Error(`기대 블록 수 미달 (${parsed.blocks.length} < ${expectedMin})`);
  }
  return parsed.blocks.map((b) => b.body);
}

async function generateOverall(
  data: SessionReportData,
  survey: SessionReportData['surveys'][number],
  areas: AreaGroup[],
  instructorGroups: InstructorGroup[]
): Promise<string[]> {
  const overall = avgOf(survey.questions.filter(isLikert));
  const areaSummary = [
    ...areas.map((a) => ({ title: a.title, avg: round2(a.avg), n: a.totalN })),
    ...instructorGroups.map((g) => ({
      title: g.instructor_name ? `${g.category} (${g.instructor_name})` : g.category,
      avg: round2(g.avg),
      n: g.totalN
    }))
  ];

  const sys = `${ANALYSIS_BASE_RULES}

만족도 종합 분석을 음슴체 text 블록 2개로 작성. blocks 배열에 정확히 2개.

블록 1 형식 (한 단락):
" ○ 만족도 조사는 교육생 {total}명 중 {n}명이 응답함. 응답률은 약 {rate}%임. 조사 항목은 {영역 이름들 나열}의 {영역수}개 영역으로 구성하였으며, 종합 만족도는 {종합평균}점으로 매우 높게(또는 높게) 나타남."

블록 2 형식 (가장 높은 영역의 사실 기반 분석, 한 단락):
" ○ {영역수}개 영역 중 {가장높은영역}이/가 {평균}점으로 가장 높게 나타남. 이는 {한 줄 사실 기반 추론}으로 분석됨."

추측은 입력 서술형 응답(text_responses)에 근거가 있을 때만. 없으면 "강사진의 전문성", "운영 지원의 안정성" 등 일반적 사실 표현으로 마무리.`;

  return await callForBlocks(
    sys,
    {
      attendance_total: data.attendance.total,
      survey_n: survey.n,
      response_rate: survey.response_rate,
      overall_avg: round2(overall.avg),
      areas: areaSummary,
      text_responses_sample: survey.questions
        .filter((q) => q.type === 'text' && q.text_responses)
        .flatMap((q) => (q.text_responses ?? []).slice(0, 5))
    },
    2
  );
}

async function generateAreaAnalysis(area: AreaGroup): Promise<string[]> {
  const sys = `${ANALYSIS_BASE_RULES}

특정 영역의 만족도 분석을 음슴체 text 블록 1개로 작성. blocks 배열에 정확히 1개.

형식:
"{문장 1: 영역 내 세부 문항 평균을 모두 언급하고 평균값 명시}. {문장 2: 응답 분포의 특징 한 줄}."

예시:
"프로그램 전반에 대한 만족도와 타인 추천 의향을 각 10점 척도로 조사한 결과, 두 문항 모두 9.2점으로 나타남. 응답자 대다수가 9점 이상의 높은 만족도를 보였으며, 불만족 사유에 대한 별도 의견은 없었음."

추측 금지. 데이터에 있는 사실만.`;

  return await callForBlocks(
    sys,
    {
      area_title: area.title,
      area_avg: round2(area.avg),
      response_count: area.totalN,
      questions: area.questions.map((q) => ({
        text: q.text,
        avg: q.avg !== null ? round2(q.avg) : null,
        n: q.n,
        distribution: q.distribution
      }))
    },
    1
  );
}

async function generateInstructorAnalysis(group: InstructorGroup): Promise<string[]> {
  const sys = `${ANALYSIS_BASE_RULES}

특정 강사의 만족도 분석을 음슴체 text 블록 1개로 작성. blocks 배열에 정확히 1개.

형식:
"{카테고리}는 {세부 항목별 평균 나열, '항목명({평균}점)' 형식}의 {세부수}개 세부 항목 평균 {강사평균}점으로 나타남."

예시:
"특강 강사 만족도는 질의응답 적극성(9.9점), 교육 열정(9.8점), 난이도 적절성(9.6점)의 3개 세부 항목 평균 9.8점으로 나타남."

추측 금지. 평균만 사실 기술.`;

  return await callForBlocks(
    sys,
    {
      category: group.category,
      instructor_name: group.instructor_name,
      group_avg: round2(group.avg),
      questions: group.questions.map((q) => ({
        text: q.text,
        avg: q.avg !== null ? round2(q.avg) : null,
        n: q.n
      }))
    },
    1
  );
}

async function generateTextClassification(
  survey: SessionReportData['surveys'][number]
): Promise<string[]> {
  const textQs = survey.questions.filter((q) => q.type === 'text' && q.text_responses);
  if (textQs.length === 0) return [];

  const sys = `${ANALYSIS_BASE_RULES}

서술형 응답을 의미별로 분류해 text 블록 여러 개로. 각 블록은:
- 첫 줄 "○ {라벨}" (예: "교육 진행 중 좋았던 점", "교육 진행 중 개선되었으면 하는 점", "향후 희망 사항", "기타 의견").
- 다음 줄부터 응답들을 " - ..." 불릿 (raw 응답 그대로, 음슴체 변형 X).
- 한 블록당 대표 5~10개. 비방·욕설은 [비방성 의견]으로, 개인 이름·소속은 [학습자]로 마스킹.

분류 라벨은 응답 내용에 따라 자유롭게 정함. 같은 분류는 한 블록으로 묶음.`;

  return await callForBlocks(
    sys,
    {
      questions: textQs.map((q) => ({
        text: q.text,
        responses: q.text_responses ?? []
      }))
    },
    1
  );
}

// ── 5) 만족도 섹션 조립 ─────────────────────────────────────────────────────

export async function buildSatisfactionSection(data: SessionReportData): Promise<ReportSection> {
  if (data.surveys.length === 0) {
    return {
      id: 'satisfaction',
      title: '3. 만족도',
      blocks: [{ kind: 'text', body: '본 회차 매핑 만족도 설문이 없음.' }]
    };
  }

  // 만족도 종합 결과 페이지에서는 첫 번째 매핑 설문을 기준. 여러 개라면 추후 확장.
  const survey = data.surveys[0];
  const areas = groupByArea(survey);
  const instructorGroups = groupByInstructor(survey);

  // 분석 멘트 LLM 호출 — 병렬
  const [overall, areaAnalyses, instructorAnalyses, textBlocks] = await Promise.all([
    generateOverall(data, survey, areas, instructorGroups),
    Promise.all(areas.map((a) => generateAreaAnalysis(a))),
    Promise.all(instructorGroups.map((g) => generateInstructorAnalysis(g))),
    generateTextClassification(survey)
  ]);

  const blocks: ReportBlock[] = [];

  // 종합 (1. 만족도 종합결과)
  blocks.push({ kind: 'text', body: `1. 만족도 종합결과\n${overall[0]}` });
  blocks.push({ kind: 'text', body: overall[1] });
  blocks.push(buildAreaSummaryTable(areas, instructorGroups));

  // 영역별 (2., 3., 4., ...)
  let sectionNo = 2;
  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];
    const analysis = areaAnalyses[i][0];
    blocks.push({
      kind: 'text',
      body: `${sectionNo}. ${area.title}(${round2(area.avg)}점)\n${analysis}`
    });
    area.questions.forEach((q, qi) => {
      blocks.push(buildQuestionLabel(String(sectionNo), qi + 1, q));
      blocks.push(buildDistributionTable(q));
    });
    sectionNo++;
  }

  // 강사별 (이어서 번호)
  for (let i = 0; i < instructorGroups.length; i++) {
    const g = instructorGroups[i];
    const analysis = instructorAnalyses[i][0];
    const label = g.instructor_name
      ? `${g.category}(${g.instructor_name}, ${round2(g.avg)}점)`
      : `${g.category}(${round2(g.avg)}점)`;
    blocks.push({ kind: 'text', body: `${sectionNo}. ${label}\n${analysis}` });
    g.questions.forEach((q, qi) => {
      blocks.push(buildQuestionLabel(String(sectionNo), qi + 1, q));
      blocks.push(buildDistributionTable(q));
    });
    sectionNo++;
  }

  // 서술형
  for (const body of textBlocks) {
    blocks.push({ kind: 'text', body });
  }

  return { id: 'satisfaction', title: '3. 만족도', blocks };
}

// ── 전체 보고서 조립 ──────────────────────────────────────────────────────
export async function buildSessionReport(data: SessionReportData): Promise<SessionReportContent> {
  const overview = buildOverviewSection(data);
  const attendance = buildAttendanceSection(data);
  const satisfaction = await buildSatisfactionSection(data);

  return {
    generated_at: new Date().toISOString(),
    model: SESSION_REPORT_MODEL,
    sections: [overview, attendance, satisfaction]
  };
}
