-- =====================================================
-- 운영자별 cohort 정렬 순서 저장
-- cohort id 배열 (앞에서부터 표시 순서). 배열에 없는 cohort는 끝에 created_at desc로.
-- =====================================================

ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS cohort_order JSONB NOT NULL DEFAULT '[]'::jsonb;
