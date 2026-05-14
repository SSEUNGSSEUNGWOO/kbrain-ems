// 입과·종강 발송 문구 기본 템플릿. 운영자가 다이얼로그에서 수정 가능.

import type { DispatchTemplate } from './dispatch-stages';

export type TemplateInput = {
  cohortName: string;
  startedAt?: string | null;   // 개강일 (입과 단계)
  endedAt?: string | null;     // 종강일 (종강·수료 단계)
  decidedAt?: string | null;   // 선발 결정일 (합격/불합격)
  location?: string | null;
  startTime?: string | null;
  contactName?: string;
  contactPhone?: string;
};

export type RenderedTemplate = {
  subject: string;
  body: string;
};

const formatKoreanDate = (yyyy_mm_dd: string | null | undefined): string => {
  if (!yyyy_mm_dd) return '추후 안내';
  const [y, m, d] = yyyy_mm_dd.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return `${y}년 ${m}월 ${d}일(${weekday})`;
};

const contactLine = (i: TemplateInput): string =>
  `${i.contactName ? `${i.contactName} ` : ''}${i.contactPhone ?? ''}`.trim() || '운영팀';

// ── 모집 단계 ────────────────────────────────────────────────────────────────
const renderRecruitPass = (i: TemplateInput): RenderedTemplate => ({
  subject: `[${i.cohortName}] 합격을 축하드립니다 — 입과 안내`,
  body: `안녕하세요. ${i.cohortName} 합격을 축하드립니다.

귀하께서 본 과정에 최종 선발되셨음을 안내드립니다.

▣ 교육 일정
  · 시작일: ${formatKoreanDate(i.startedAt)}${i.startTime ? ` ${i.startTime}` : ''}
  · 장소: ${i.location ?? '추후 안내'}

▣ 입과 절차
  · 사전 안내 메일·문자가 단계적으로 발송될 예정입니다.
  · 사전이수 학습은 시작일 전까지 완료해 주십시오.

▣ 참여 의사 확인
  · 부득이하게 참여가 어려운 경우 ${formatKoreanDate(i.startedAt)} 전까지 운영팀에 연락 부탁드립니다.

문의: ${contactLine(i)}

다시 한 번 합격을 축하드리며 함께하게 되어 기쁩니다.`
});

const renderRecruitFail = (i: TemplateInput): RenderedTemplate => ({
  subject: `[${i.cohortName}] 선발 결과 안내`,
  body: `안녕하세요.

${i.cohortName} 모집에 지원해 주셔서 감사합니다.

이번 기수의 경우 제한된 정원과 사업 운영 방향에 따라 아쉽게도 선발되지 못하셨음을 안내드립니다.
지원자분의 역량 부족이 아닌 정원 제약에 기인한 결정임을 양해 부탁드립니다.

향후 다른 기수·과정의 모집이 시작될 때 별도 안내를 드릴 수 있도록 노력하겠습니다.
관심과 지원에 다시 한 번 감사드립니다.

문의: ${contactLine(i)}`
});

// ── 입과 단계 ────────────────────────────────────────────────────────────────
const renderD7 = (i: TemplateInput): RenderedTemplate => ({
  subject: `[${i.cohortName}] 교육 시작 1주일 전 안내`,
  body: `안녕하세요. ${i.cohortName} 입과자 여러분.

다음 주 ${formatKoreanDate(i.startedAt)}부터 교육이 시작됩니다.
원활한 참여를 위해 아래 사항을 미리 확인해 주십시오.

▣ 일정
  · 시작일: ${formatKoreanDate(i.startedAt)}${i.startTime ? ` ${i.startTime}` : ''}
  · 장소: ${i.location ?? '추후 안내'}

▣ 사전이수 학습
  · 이러닝 사전학습 과정을 시작일 전까지 완료해 주십시오.
  · 진도율 100% 미달 시 별도 안내드릴 수 있습니다.

▣ 준비물
  · 노트북(전원 어댑터 포함)
  · 신분증

문의: ${contactLine(i)}

감사합니다.`
});

const renderD3 = (i: TemplateInput): RenderedTemplate => ({
  subject: `[${i.cohortName}] 사전이수 학습 점검 안내`,
  body: `안녕하세요. ${i.cohortName} 입과자 여러분.

교육 시작 3일 전입니다. 사전이수 학습 진도를 한 번 더 확인해 주십시오.

▣ 진도율 100% 미완료자
  · 시작일 전까지 반드시 완료 부탁드립니다.
  · 미완료 상태로 입과 시 본 과정 이수에 영향이 있을 수 있습니다.

▣ 일정
  · 시작일: ${formatKoreanDate(i.startedAt)}${i.startTime ? ` ${i.startTime}` : ''}
  · 장소: ${i.location ?? '추후 안내'}

문의: ${contactLine(i)}

감사합니다.`
});

const renderD1 = (i: TemplateInput): RenderedTemplate => ({
  subject: `[${i.cohortName}] 내일 교육 안내 (리마인드)`,
  body: `안녕하세요. ${i.cohortName} 입과자 여러분.

내일 ${formatKoreanDate(i.startedAt)} 교육이 시작됩니다. 다시 한 번 안내드립니다.

▣ 일정·장소
  · 일시: ${formatKoreanDate(i.startedAt)}${i.startTime ? ` ${i.startTime}` : ''}
  · 장소: ${i.location ?? '추후 안내'}

▣ 안내사항
  · 도착 즉시 안내 데스크에서 출석 체크 부탁드립니다.
  · 노트북·전원·신분증을 지참해 주십시오.
  · 주차 안내가 필요하신 분은 사전에 운영팀에 연락 부탁드립니다.

문의: ${contactLine(i)}

내일 뵙겠습니다.`
});

const renderD0 = (i: TemplateInput): RenderedTemplate => ({
  subject: `[${i.cohortName}] 오늘 교육 시작 — 도착 안내`,
  body: `안녕하세요. ${i.cohortName} 입과자 여러분.

오늘 ${formatKoreanDate(i.startedAt)} 교육 시작일입니다.

▣ 장소·도착
  · 장소: ${i.location ?? '추후 안내'}
  · 시작: ${i.startTime ?? '안내된 시각'}
  · 도착 즉시 안내 데스크에서 체크해 주십시오.

▣ 문의
  · ${contactLine(i)}

도착 중 문제 발생 시 즉시 위 연락처로 알려주십시오.
오늘 함께 출발하겠습니다.`
});

// ── 종강·수료 단계 ─────────────────────────────────────────────────────────
const renderClosingD1 = (i: TemplateInput): RenderedTemplate => ({
  subject: `[${i.cohortName}] 내일 종강 — 마무리 안내`,
  body: `안녕하세요. ${i.cohortName} 교육생 여러분.

내일 ${formatKoreanDate(i.endedAt)} 본 과정의 종강일입니다.

▣ 종강일 일정
  · 일시: ${formatKoreanDate(i.endedAt)}
  · 장소: ${i.location ?? '추후 안내'}
  · 사후 만족도 설문, 수료 평가 등이 진행됩니다.

▣ 사후 진단·설문
  · 만족도 설문 링크는 종강 후 별도 안내드립니다.
  · 사후 진단 미응답 시 수료 처리에 영향이 있을 수 있습니다.

▣ 수료증 발급
  · 수료 기준 충족자에 한해 추후 안내드립니다.

문의: ${contactLine(i)}

지난 기간 동안의 노고에 감사드립니다.`
});

const renderCompletionCertificate = (i: TemplateInput): RenderedTemplate => ({
  subject: `[${i.cohortName}] 수료증 발급 안내`,
  body: `안녕하세요. ${i.cohortName} 수료자 여러분.

본 과정 수료를 진심으로 축하드립니다.

▣ 수료증 발급 안내
  · 수료증은 별도 안내된 경로로 수령 가능합니다.
  · 발급 일정: ${formatKoreanDate(i.endedAt)} 이후 순차 발송 예정
  · 미수령 시 운영팀에 문의해 주십시오.

▣ 후속 안내
  · 향후 운영되는 심화 과정·네트워킹 행사 정보를 별도 채널로 안내드릴 예정입니다.

문의: ${contactLine(i)}

다시 한 번 수료를 축하드리며, 현장에서 좋은 성과 있으시기를 응원합니다.`
});

const RENDERERS: Record<DispatchTemplate, (i: TemplateInput) => RenderedTemplate> = {
  recruit_pass: renderRecruitPass,
  recruit_fail: renderRecruitFail,
  d7_orientation: renderD7,
  d3_prereq_check: renderD3,
  d1_reminder: renderD1,
  d0_arrival: renderD0,
  closing_d1: renderClosingD1,
  completion_certificate: renderCompletionCertificate
};

export function renderDispatchTemplate(
  template: DispatchTemplate,
  input: TemplateInput
): RenderedTemplate {
  return RENDERERS[template](input);
}
