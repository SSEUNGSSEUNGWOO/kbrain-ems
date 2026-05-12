-- =====================================================
-- cohorts — 일정 추가 필드
--   decided_at      : 선발일
--   notified_at     : 선발통보일
--   delivery_method : 운영 방법 (비대면 / 대면 / 과제형 등)
-- =====================================================

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS decided_at DATE,
  ADD COLUMN IF NOT EXISTS notified_at DATE,
  ADD COLUMN IF NOT EXISTS delivery_method TEXT;
