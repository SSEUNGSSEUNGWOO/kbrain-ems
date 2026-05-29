-- 운영자 role에 'viewer' 추가.
-- viewer: 일반 운영자(operator)와 동일한 페이지에 접근 가능하지만 개인정보(휴대폰·이메일)는
--          UI에서 보이지 않는다. 본인 화면에는 '운영자'로 표시되어 외부에서 구분되지 않는다.

ALTER TABLE public.operators
  DROP CONSTRAINT IF EXISTS operators_role_check;

ALTER TABLE public.operators
  ADD CONSTRAINT operators_role_check
  CHECK (role IN ('developer', 'head', 'operator', 'viewer'));

COMMENT ON COLUMN public.operators.role IS
  '권한: developer(전체), head(총괄), operator(운영자, 풀권한), viewer(운영자, 개인정보 마스킹)';
