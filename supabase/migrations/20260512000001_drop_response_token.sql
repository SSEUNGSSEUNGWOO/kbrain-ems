-- =====================================================
-- survey_responses.token 컬럼 제거
--
-- 잔재 컬럼. 응답 row의 식별은 pk(id)로 충분하다.
-- /survey/[responseId] 라우트에서 row id를 그대로 사용.
-- =====================================================

ALTER TABLE public.survey_responses DROP COLUMN IF EXISTS token;
