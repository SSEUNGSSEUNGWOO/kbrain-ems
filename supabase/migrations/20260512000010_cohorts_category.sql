-- cohort 카테고리 분류 (PDF 교육일정의 4구분과 동일).
-- name 패턴 자동 분류가 한계가 있어 명시 컬럼으로 분리.
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 기존 cohort backfill
UPDATE public.cohorts SET category = 'champion' WHERE name LIKE 'AI 챔피언%' AND category IS NULL;
UPDATE public.cohorts SET category = 'experts' WHERE name LIKE '전문인재%' AND category IS NULL;
