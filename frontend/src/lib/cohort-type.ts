// cohort 이름 → 유형 판정 + 색상 도트. 캘린더 월/타임라인 뷰 공통 사용.
// 매칭 순서 중요 — '블루 자기주도형' 이 '블루' 보다 먼저 잡히도록.

export type CohortType =
  | 'self'
  | 'expert'
  | 'training'
  | 'challenge'
  | 'blue'
  | 'green'
  | 'track'
  | 'other';

export type CohortTypeMeta = {
  type: CohortType;
  label: string;
  dot: string; // Tailwind 배경 클래스
  ring: string; // 좌측 스트라이프용 (선택)
};

const META: Record<CohortType, Omit<CohortTypeMeta, 'type'>> = {
  self: { label: '자기주도', dot: 'bg-orange-500', ring: 'ring-orange-400' },
  expert: { label: '전문인재', dot: 'bg-yellow-500', ring: 'ring-yellow-400' },
  training: { label: '강사양성', dot: 'bg-pink-500', ring: 'ring-pink-400' },
  challenge: { label: '대전환', dot: 'bg-rose-500', ring: 'ring-rose-400' },
  blue: { label: '블루', dot: 'bg-blue-500', ring: 'ring-blue-400' },
  green: { label: '그린', dot: 'bg-emerald-500', ring: 'ring-emerald-400' },
  track: { label: '트랙', dot: 'bg-violet-500', ring: 'ring-violet-400' },
  other: { label: '기타', dot: 'bg-slate-400', ring: 'ring-slate-300' }
};

const TRACK_KEYWORDS = [
  '관리자 AI 리더십',
  'AI 리터러시',
  '데이터 리터러시',
  '노코드 데이터분석',
  '노코드 AI 서비스',
  'AI 행정',
  '데이터분석 심화',
  '바이브 코딩'
];

export function detectCohortType(name: string): CohortTypeMeta {
  const n = name;
  // 자기주도형이 먼저 (블루/그린 자기주도형은 self로)
  if (n.includes('자기주도')) return { type: 'self', ...META.self };
  if (n.includes('전문인재')) return { type: 'expert', ...META.expert };
  if (n.includes('강사')) return { type: 'training', ...META.training };
  if (n.includes('대전환')) return { type: 'challenge', ...META.challenge };
  if (n.includes('블루')) return { type: 'blue', ...META.blue };
  if (n.includes('그린')) return { type: 'green', ...META.green };
  if (TRACK_KEYWORDS.some((k) => n.includes(k))) return { type: 'track', ...META.track };
  return { type: 'other', ...META.other };
}
