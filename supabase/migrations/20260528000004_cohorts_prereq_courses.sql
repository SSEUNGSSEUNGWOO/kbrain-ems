-- cohort별 필수 사전학습 과목 정의.
-- 값은 lms_completions.course_code와 매칭되는 자유 텍스트 배열.
-- 예: ARRAY['ai_literacy', 'data_literacy']
-- NULL/빈 배열 = 사전학습 요구 없음.

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS prereq_course_codes TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN public.cohorts.prereq_course_codes IS
  '이 cohort의 필수 사전학습 과목 코드 배열. lms_completions.course_code와 매칭. 자동선발에서 등급 계산에 사용.';
