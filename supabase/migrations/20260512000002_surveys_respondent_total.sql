-- =====================================================
-- surveys.respondent_total — 응답 분모 override
--
-- NULL이면 cohort 학생 수를 분모로 사용 (디폴트).
-- 1·2기 합동 설문처럼 cohort 학생 수와 응답 모집이 다른 경우 명시.
-- =====================================================

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS respondent_total INTEGER;

COMMENT ON COLUMN public.surveys.respondent_total IS
  '응답률 분모 override. NULL이면 cohort 학생 수 사용.';
