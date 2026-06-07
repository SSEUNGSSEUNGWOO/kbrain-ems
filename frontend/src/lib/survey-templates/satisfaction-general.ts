/**
 * 일반교육 만족도 설문 템플릿.
 *
 * 구조:
 *  - 섹션 1: 전반적 만족도 (likert10 × 2 + text × 2)
 *  - 섹션 2: 교육 내용 만족도 (likert10 × 3 + text × 3) — 사전수강·본과정·업무도움
 *  - 섹션 3: 환경 만족도 (likert10 × 4 + text × 4 + 필수 text × 1) — 비대면환경·시간·운영지원·진행속도·선호 사유
 *  - 섹션 4~(3+N): 강사별 만족도 (강사 N명 × 6문항)
 *  - 섹션 마지막: 서술형 3문항
 *
 * 강사 1명 기준 총: 2+3+5 + 6 + 3 = 19문항 (필수 likert 9 + 강사 likert 3 + 필수 text 1)
 */

import type { TablesInsert } from '@/lib/supabase/types';
import { LIKERT10_LABELS, SCALE_OPTIONS } from './satisfaction';

type StaticQuestion = {
  type: 'likert10' | 'text';
  text: string;
  required: boolean;
};

const HEADER_SECTIONS: { section_title: string; questions: StaticQuestion[] }[] = [
  {
    section_title: '교육 프로그램에 대한 전반적인 만족도',
    questions: [
      { type: 'likert10', text: '이번 프로그램 전반에 대하여 얼마나 만족하셨습니까?', required: true },
      { type: 'text', text: '불만족 시 사유', required: false },
      { type: 'likert10', text: '이번 프로그램을 다른 사람에게 추천하실 의향이 있으십니까?', required: true },
      { type: 'text', text: '추천하지 않으실 경우 사유', required: false }
    ]
  },
  {
    section_title: '교육 내용 만족도',
    questions: [
      { type: 'likert10', text: '본 과정에 앞서 진행된 사전 수강 교육과정은 학습자 수준에 맞춰 체계적인 내용으로 구성되었습니까?', required: true },
      { type: 'text', text: '사전 수강 교육과정 불만족 시 사유', required: false },
      { type: 'likert10', text: '본 과정은 학습자 수준에 맞춰 체계적인 내용으로 구성되었습니까?', required: true },
      { type: 'text', text: '본 과정 구성 불만족 시 사유', required: false },
      { type: 'likert10', text: '본 과정에서 배운 내용이 실제 업무에 도움이 되었습니까?', required: true },
      { type: 'text', text: '업무 도움 불만족 시 사유', required: false }
    ]
  },
  {
    section_title: '환경 만족도 (비대면)',
    questions: [
      { type: 'likert10', text: '본 과정의 비대면 교육 환경 지원에 대해 만족하셨습니까?', required: true },
      { type: 'text', text: '비대면 교육 환경 불만족 시 사유', required: false },
      { type: 'likert10', text: '본 과정을 위해 주어진 시간이 적절하였습니까?', required: true },
      { type: 'text', text: '시간 적절성 불만족 시 사유', required: false },
      { type: 'likert10', text: '본 과정을 위한 운영, 지원에 대하여 만족하셨습니까?', required: true },
      { type: 'text', text: '운영·지원 불만족 시 사유', required: false },
      { type: 'likert10', text: '본 과정의 교육 진행 속도에 대하여 만족하셨습니까?', required: true },
      { type: 'text', text: '진행 속도 불만족 시 사유', required: false },
      {
        type: 'text',
        text: '비대면 혹은 집합 교육 중 선호되는 교육 및 선호이유를 답변해주세요. (예: 집합 - 교육 효과·환경·집중도 / 비대면 - 이동시간 절감)',
        required: true
      }
    ]
  }
];

const INSTRUCTOR_QUESTIONS: StaticQuestion[] = [
  { type: 'likert10', text: '본 과정의 강사는 교육을 열정적으로 이끌었습니까?', required: true },
  { type: 'text', text: '열정 부분 불만족 시 사유', required: false },
  { type: 'likert10', text: '본 과정의 강사는 질의응답 혹은 피드백에 적극적으로 답하였습니까?', required: true },
  { type: 'text', text: '질의응답·피드백 불만족 시 사유', required: false },
  { type: 'likert10', text: '본 과정의 난이도는 대체로 적절하였습니까?', required: true },
  { type: 'text', text: '난이도 불만족 시 사유', required: false }
];

const FOOTER_SECTION: { section_title: string; questions: StaticQuestion[] } = {
  section_title: '서술형',
  questions: [
    { type: 'text', text: '교육 진행 중 유익하고 좋았던 점을 자유롭게 작성해주세요.', required: false },
    { type: 'text', text: '교육 진행 중 개선되었으면 하는 점을 자유롭게 작성해주세요.', required: false },
    { type: 'text', text: '향후 AI 및 데이터 관련 주제에 대하여 교육받고 싶은 주제가 있다면 작성해주세요.', required: false }
  ]
};

type InstructorContext = {
  id: string;
  name: string;
  sessionTitle?: string;
};

type BuildArgs = {
  surveyId: string;
  instructors: InstructorContext[];
};

export function buildGeneralSatisfactionQuestions(
  args: BuildArgs
): TablesInsert<'survey_questions'>[] {
  const { surveyId, instructors } = args;
  const out: TablesInsert<'survey_questions'>[] = [];
  let questionNo = 1;

  HEADER_SECTIONS.forEach((section, idx) => {
    const sectionNo = idx + 1;
    for (const q of section.questions) {
      out.push({
        survey_id: surveyId,
        question_no: questionNo++,
        type: q.type,
        text: q.text,
        required: q.required,
        section_no: sectionNo,
        section_title: section.section_title,
        instructor_id: null,
        options: q.type === 'likert10' ? { ...SCALE_OPTIONS, labels: [...LIKERT10_LABELS] } : null
      });
    }
  });

  instructors.forEach((inst, idx) => {
    const sectionNo = HEADER_SECTIONS.length + 1 + idx;
    const sectionTitle = inst.sessionTitle
      ? `강사 만족도 (${inst.name}) — ${inst.sessionTitle}`
      : `강사 만족도 (${inst.name})`;
    for (const q of INSTRUCTOR_QUESTIONS) {
      out.push({
        survey_id: surveyId,
        question_no: questionNo++,
        type: q.type,
        text: q.text,
        required: q.required,
        section_no: sectionNo,
        section_title: sectionTitle,
        instructor_id: inst.id,
        options: q.type === 'likert10' ? { ...SCALE_OPTIONS, labels: [...LIKERT10_LABELS] } : null
      });
    }
  });

  const footerSectionNo = HEADER_SECTIONS.length + instructors.length + 1;
  for (const q of FOOTER_SECTION.questions) {
    out.push({
      survey_id: surveyId,
      question_no: questionNo++,
      type: q.type,
      text: q.text,
      required: q.required,
      section_no: footerSectionNo,
      section_title: FOOTER_SECTION.section_title,
      instructor_id: null,
      options: null
    });
  }

  return out;
}
