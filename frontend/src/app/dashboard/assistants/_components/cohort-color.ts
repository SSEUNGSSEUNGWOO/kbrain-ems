// cohort 이름 기반 색상 매핑. HTML 월력표(_보조강사_월력표_최종.html)와 동일 키로 매칭.
// 매칭 실패 시 이름 hash 로 안정적인 fallback 색상.
const NAMED: { match: RegExp; color: string }[] = [
  { match: /리터러시와\s*업무활용|AI\s*리터러시/i, color: '#4F46E5' },
  { match: /챔피언\s*그린/i, color: '#0EA5E9' },
  { match: /챔피언\s*블루/i, color: '#10B981' },
  { match: /행정\s*융합\s*기획/i, color: '#F59E0B' },
  { match: /관리자.*리더십/i, color: '#EF4444' },
  { match: /노코드.*서비스|노코드\s*AI/i, color: '#8B5CF6' },
  { match: /데이터\s*리터러시/i, color: '#14B8A6' },
  { match: /바이브\s*코딩|LLM\s*서비스/i, color: '#F97316' },
  { match: /노코드\s*데이터분석|생성형.*노코드/i, color: '#64748B' },
  { match: /데이터분석\s*심화/i, color: '#EC4899' },
  { match: /공공.*대전환.*챌린지/i, color: '#6366F1' }
];

const FALLBACK_PALETTE = [
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#14B8A6',
  '#F97316',
  '#64748B',
  '#EC4899',
  '#6366F1'
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function colorForCohort(name: string): string {
  for (const { match, color } of NAMED) {
    if (match.test(name)) return color;
  }
  return FALLBACK_PALETTE[hash(name) % FALLBACK_PALETTE.length];
}
