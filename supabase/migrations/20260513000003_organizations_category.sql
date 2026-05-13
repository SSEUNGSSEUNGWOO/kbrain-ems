-- 기관(organization) 분류: 지원자 필터·통계용.
-- 값: 'central'(중앙부처) | 'metro'(광역지자체) | 'local'(기초지자체) | 'edu'(교육청) | 'public'(공공기관) | 'other'(기타)
-- enum 강제 안 함 (TEXT) — application 레벨에서 검증.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS organizations_category_idx ON public.organizations(category);

COMMENT ON COLUMN public.organizations.category IS 'central|metro|local|edu|public|other — 자동 분류 후 운영자 수동 보정 가능.';
