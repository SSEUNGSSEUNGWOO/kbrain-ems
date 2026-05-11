-- =====================================================
-- operators 테이블과 Supabase Auth (auth.users) 매핑
--
-- 흐름:
--   운영자가 /lock에서 이메일·비밀번호로 Supabase Auth 로그인
--   → auth.users row 생성·매칭
--   → operators.auth_user_id 로 매핑 → role/title 확인
-- =====================================================

ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS operators_auth_user_idx ON public.operators(auth_user_id);
