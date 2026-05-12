/**
 * 만족도 설문 표준 템플릿.
 *
 * 구조:
 *  - 섹션 1~3 (공통): 전반·내용·환경 만족도 = 12문항 고정
 *  - 섹션 4~(3+N) (강사별): 강사 N명 × 6문항 동적
 *  - 마지막 섹션 (서술형): 3문항 고정
 *
 * 강사 1명: 12 + 6 + 3 = 21문항
 * 강사 2명: 12 + 12 + 3 = 27문항 (5/7 형식)
 * 강사 N명: 12 + 6N + 3
 */

import type { TablesInsert } from '@/lib/supabase/types';

/** 5점 척도 라벨 (1=매우 불만족, 5=매우 만족) */
export const LIKERT5_LABELS = ['매우 불만족', '불만족', '보통', '만족', '매우 만족'] as const;

export const SCALE_OPTIONS = {
  min: 1,
  max: 5,
  labels: LIKERT5_LABELS
} as const;

type StaticQuestion = {
  type: 'likert5' | 'text';
  text: string;
  required: boolean;
};

// 섹션 1~3 (공통 헤더)
const HEADER_SECTIONS: { section_title: string; questions: StaticQuestion[] }[] = [
  {
    section_title: '교육 프로그램에 대한 전반적인 만족도',
    questions: [
      { type: 'likert5', text: '이번 프로그램 전반에 대하여 얼마나 만족하셨습니까?', required: true },
      { type: 'text', text: '불만족 시 사유', required: false },
      { type: 'likert5', text: '이번 프로그램을 다른 사람에게 추천하실 의향이 있으십니까?', required: true },
      { type: 'text', text: '추천하지 않으실 경우 사유', required: false }
    ]
  },
  {
    section_title: '교육 내용 만족도',
    questions: [
      { type: 'likert5', text: '본 과정은 학습자 수준에 맞춰 체계적인 내용으로 구성되었습니까?', required: true },
      { type: 'text', text: '불만족 시 사유', required: false }
    ]
  },
  {
    section_title: '환경 만족도',
    questions: [
      { type: 'likert5', text: '본 과정의 교육 시설 및 환경에 만족하셨습니까?', required: true },
      { type: 'text', text: '시설·환경 불만족 시 사유', required: false },
      { type: 'likert5', text: '본 과정을 위해 주어진 시간은 적절하였습니까?', required: true },
      { type: 'text', text: '시간 적절성 불만족 시 사유', required: false },
      { type: 'likert5', text: '본 과정을 위한 운영·지원에 대하여 만족하셨습니까?', required: true },
      { type: 'text', text: '운영·지원 불만족 시 사유', required: false }
    ]
  }
];

// 강사 1명당 6문항 — 강사명·세션제목은 builder에서 섹션 제목에 주입
const INSTRUCTOR_QUESTIONS: StaticQuestion[] = [
  { type: 'likert5', text: '본 과정의 강사는 교육을 열정적으로 이끌었습니까?', required: true },
  { type: 'text', text: '열정 부분 불만족 시 사유', required: false },
  { type: 'likert5', text: '본 과정의 강사는 질의응답 혹은 피드백에 적극적으로 답하였습니까?', required: true },
  { type: 'text', text: '질의응답·피드백 불만족 시 사유', required: false },
  { type: 'likert5', text: '본 과정의 난이도는 대체로 적절하였습니까?', required: true },
  { type: 'text', text: '난이도 불만족 시 사유', required: false }
];

// 마지막 푸터 — 자유 서술 3개
const FOOTER_SECTION: { section_title: string; questions: StaticQuestion[] } = {
  section_title: '서술형',
  questions: [
    { type: 'text', text: '교육 진행 중 유익하고 좋았던 점을 자유롭게 작성해 주세요.', required: false },
    { type: 'text', text: '교육 진행 중 개선되었으면 하는 점을 자유롭게 작성해 주세요.', required: false },
    {
      type: 'text',
      text: '전문인재 인증자 특강 관련 희망 방향 및 주제를 자유롭게 작성해 주세요. (매주 교육마다 진행 예정)',
      required: false
    }
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

export function buildSatisfactionQuestions(args: BuildArgs): TablesInsert<'survey_questions'>[] {
  const { surveyId, instructors } = args;
  const out: TablesInsert<'survey_questions'>[] = [];
  let questionNo = 1;

  // 1) 공통 헤더 섹션 1~3
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
        options: q.type === 'likert5' ? { ...SCALE_OPTIONS, labels: [...LIKERT5_LABELS] } : null
      });
    }
  });

  // 2) 강사별 섹션 4~(3+N)
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
        options: q.type === 'likert5' ? { ...SCALE_OPTIONS, labels: [...LIKERT5_LABELS] } : null
      });
    }
  });

  // 3) 푸터 서술형 섹션
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
