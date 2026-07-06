-- 집중교육 기간(예: 특화 종합과정의 3일 집중 수업) 저장 필드.
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS intensive_start_at date,
  ADD COLUMN IF NOT EXISTS intensive_end_at date;

COMMENT ON COLUMN public.cohorts.intensive_start_at IS
  '집중교육 시작일. 특화 종합과정 등 짧은 기간 집중 수업이 있는 cohort용.';
COMMENT ON COLUMN public.cohorts.intensive_end_at IS
  '집중교육 종료일.';
