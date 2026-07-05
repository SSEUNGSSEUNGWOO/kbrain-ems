-- 보조강사(assistant) role 추가 + instructors 매핑 컬럼.
--
-- assistant는 본인이 세션에 배정된 cohort만 사이드바·페이지에서 볼 수 있고,
-- 모든 쓰기 액션은 차단된다(viewer 수준). 시야 계산은 아래 조인으로:
--   operators.instructor_id → instructors.id → session_instructors → sessions.cohort_id

ALTER TABLE public.operators
  DROP CONSTRAINT IF EXISTS operators_role_check;

ALTER TABLE public.operators
  ADD CONSTRAINT operators_role_check
  CHECK (role IN ('developer', 'head', 'viewer', 'assistant'));

ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS instructor_id uuid
    REFERENCES public.instructors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS operators_instructor_id_idx
  ON public.operators(instructor_id)
  WHERE instructor_id IS NOT NULL;

COMMENT ON COLUMN public.operators.role IS
  '권한: developer(전체), head(총괄), viewer(운영자, 개인정보 마스킹), assistant(보조강사, 본인 배정 cohort 읽기 전용)';

COMMENT ON COLUMN public.operators.instructor_id IS
  'assistant role일 때 시야 계산의 앵커. instructors row와 1:1 매핑되어 session_instructors로 소속 cohort 계산.';
