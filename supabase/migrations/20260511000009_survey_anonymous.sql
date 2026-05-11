-- =====================================================
-- 만족도 설문 익명화
--
-- survey_responses.student_id를 제출 후 NULL로 비울 수 있게 NOT NULL 해제.
-- 누가 응답을 완료했는지는 별도 survey_completions 테이블에 분리해서
-- 응답 내용 ↔ 학생 매칭을 끊는다.
-- =====================================================

ALTER TABLE public.survey_responses
  ALTER COLUMN student_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.survey_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (survey_id, student_id)
);

CREATE INDEX IF NOT EXISTS survey_completions_survey_idx
  ON public.survey_completions(survey_id);

ALTER TABLE public.survey_completions ENABLE ROW LEVEL SECURITY;
