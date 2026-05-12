-- =====================================================
-- assignments.session_id — 과제를 회차(세션)에 매핑
--
-- NULL이면 cohort 단위 과제 (legacy 또는 기수 전체용).
-- 수업 생성 시 자동 발급되는 과제는 session_id를 함께 받는다.
-- =====================================================

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assignments_session_idx ON public.assignments(session_id);
