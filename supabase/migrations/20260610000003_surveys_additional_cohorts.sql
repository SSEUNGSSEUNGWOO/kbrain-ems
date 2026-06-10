-- 한 만족도 설문을 여러 cohort 에 연결 (예: 1기·2기 통합 설문).
-- 운영자가 설문 편집 페이지에서 추가 cohort 를 선택하면 양쪽 만족도 메뉴에 노출되고
-- 결과 분모도 모든 연결 cohort 학생 수 합으로 계산.

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS additional_cohort_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS surveys_additional_cohort_ids_idx
  ON public.surveys USING GIN (additional_cohort_ids);

COMMENT ON COLUMN public.surveys.additional_cohort_ids IS
  '이 설문이 추가로 적용되는 cohort id 목록. 1차 cohort 는 cohort_id 컬럼.';
