// 소속구분(applicants.category 한글 라벨) 표시 상수.
// DB 저장값 그대로 쓴다 — 중앙부처/광역지자체/기초지자체/공공기관/지방공공기관/교육행정기관/기타.
// 목록에 없는 라벨(과거 데이터 표기 변형 등)은 숨기지 말고 목록 뒤에 이어 붙인다.

export const AFFILIATION_LABELS = [
  '중앙부처',
  '광역지자체',
  '기초지자체',
  '공공기관',
  '지방공공기관',
  '교육행정기관',
  '기타'
] as const;

export const UNCLASSIFIED_LABEL = '미분류';

// 도넛·뱃지 색 — 기존 CATEGORY_CLASS(파랑/청록/에메랄드/앰버/바이올렛) 톤과 맞춤
export const AFFILIATION_COLORS: Record<string, string> = {
  중앙부처: '#3b82f6', // blue-500
  광역지자체: '#06b6d4', // cyan-500
  기초지자체: '#10b981', // emerald-500
  공공기관: '#f59e0b', // amber-500
  지방공공기관: '#f97316', // orange-500
  교육행정기관: '#8b5cf6', // violet-500
  기타: '#64748b', // slate-500
  [UNCLASSIFIED_LABEL]: '#cbd5e1' // slate-300
};
