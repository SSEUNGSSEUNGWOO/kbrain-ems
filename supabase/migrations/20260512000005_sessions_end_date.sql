-- =====================================================
-- sessions.session_end_date — 종료일 (multi-day 회차 지원)
--   session_date 가 시작일, session_end_date 가 종료일. 단일 일자면 NULL.
-- =====================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_end_date DATE;
