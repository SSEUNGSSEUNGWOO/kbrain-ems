export type OrganizationCategory =
  | 'central'
  | 'basic_local'
  | 'metro_local'
  | 'public'
  | 'education'
  | 'unknown';

export const ORGANIZATION_CATEGORY_LABEL: Record<OrganizationCategory, string> = {
  central: '중앙부처',
  basic_local: '기초지자체',
  metro_local: '광역지자체',
  public: '공공기관',
  education: '교육행정기관',
  unknown: '미분류'
};

const CENTRAL_MINISTRIES = [
  '감사원',
  '개인정보보호위원회',
  '고용노동부',
  '공정거래위원회',
  '과학기술정보통신부',
  '교육부',
  '국가보훈부',
  '국무조정실',
  '국무총리비서실',
  '국민권익위원회',
  '국방부',
  '국세청',
  '국토교통부',
  '금융위원회',
  '기상청',
  '기획재정부',
  '농림축산식품부',
  '농촌진흥청',
  '대검찰청',
  '문화체육관광부',
  '문화재청',
  '방송통신위원회',
  '방위사업청',
  '법무부',
  '법제처',
  '보건복지부',
  '산림청',
  '산업통상자원부',
  '소방청',
  '식품의약품안전처',
  '여성가족부',
  '외교부',
  '인사혁신처',
  '조달청',
  '중소벤처기업부',
  '질병관리청',
  '통계청',
  '통일부',
  '특허청',
  '해양경찰청',
  '해양수산부',
  '행정안전부',
  '환경부'
];

const METRO_NAMES = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도'
];

const CENTRAL_OVERRIDES = [
  '경찰청경찰수사연수원',
  '국립수산과학원'
];

const PUBLIC_OVERRIDES = [
  '코레일유통',
  '한국국제협력단',
  '한국석유관리원'
];

const METRO_OVERRIDES = [
  '전북특별자치도금암119'
];

const BASIC_LOCAL_PREFIXES = [
  '경기도',
  '경상남도',
  '경상북도',
  '서울시',
  '서울특별시',
  '충청남도'
];

export function classifyOrganization(name: string | null | undefined): OrganizationCategory {
  const org = (name ?? '').replace(/\s+/g, '').trim();
  if (!org || org === '-') return 'unknown';

  if (CENTRAL_OVERRIDES.includes(org)) return 'central';
  if (PUBLIC_OVERRIDES.includes(org)) return 'public';
  if (METRO_OVERRIDES.includes(org)) return 'metro_local';

  if (
    org.includes('교육청') ||
    org.includes('교육지원청') ||
    org.includes('교육연수원') ||
    org.includes('교육행정')
  ) {
    return 'education';
  }

  if (
    METRO_NAMES.some((metro) => org === metro || org === `${metro}청` || org === `${metro}청사`) ||
    org.endsWith('도청') ||
    org.endsWith('특별시청') ||
    org.endsWith('광역시청') ||
    org.endsWith('특별자치시청') ||
    org.endsWith('특별자치도청')
  ) {
    return 'metro_local';
  }

  if (
    BASIC_LOCAL_PREFIXES.some(
      (prefix) => org.startsWith(prefix) && (org.endsWith('시') || org.endsWith('군') || org.endsWith('구'))
    ) ||
    org.endsWith('시청') ||
    org.endsWith('군청') ||
    org.endsWith('구청') ||
    org.includes('주민센터') ||
    org.endsWith('읍사무소') ||
    org.endsWith('면사무소') ||
    org.endsWith('동사무소')
  ) {
    return 'basic_local';
  }

  if (CENTRAL_MINISTRIES.some((ministry) => org === ministry || org.startsWith(ministry))) {
    return 'central';
  }

  if (
    org.endsWith('부') ||
    org.endsWith('처') ||
    org.endsWith('청') ||
    org.endsWith('위원회')
  ) {
    return 'central';
  }

  if (
    org.includes('공사') ||
    org.includes('공단') ||
    org.includes('재단') ||
    org.includes('진흥원') ||
    org.includes('연구원') ||
    org.includes('연구소') ||
    org.includes('개발원') ||
    org.includes('평가원') ||
    org.includes('정보원') ||
    org.includes('센터')
  ) {
    return 'public';
  }

  return 'unknown';
}
