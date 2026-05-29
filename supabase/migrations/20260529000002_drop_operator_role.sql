-- 'operator' role을 'viewer'로 통합.
-- 'operator'와 'viewer' 모두 UI에 '운영자'로 표시되었고 사용자가 둘을 구분할
-- 이유가 없어 권한 종류를 단순화한다. 풀권한이 필요한 경우 head/developer를 쓴다.

UPDATE public.operators SET role = 'viewer' WHERE role = 'operator';

ALTER TABLE public.operators
  DROP CONSTRAINT IF EXISTS operators_role_check;

ALTER TABLE public.operators
  ADD CONSTRAINT operators_role_check
  CHECK (role IN ('developer', 'head', 'viewer'));

ALTER TABLE public.operators ALTER COLUMN role SET DEFAULT 'viewer';

COMMENT ON COLUMN public.operators.role IS
  '권한: developer(전체), head(총괄), viewer(운영자, 개인정보 마스킹)';
