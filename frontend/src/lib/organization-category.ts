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

const LABEL_TO_CATEGORY = Object.fromEntries(
  Object.entries(ORGANIZATION_CATEGORY_LABEL).map(([k, v]) => [v, k as OrganizationCategory])
) as Record<string, OrganizationCategory>;

/** 신청서 응답으로 받은 한글 라벨(applicants.category)을 카테고리 키로 변환. 없으면 null. */
export function categoryFromLabel(label: string | null | undefined): OrganizationCategory | null {
  if (!label) return null;
  return LABEL_TO_CATEGORY[label.trim()] ?? null;
}

