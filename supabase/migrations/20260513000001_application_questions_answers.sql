-- =====================================================
-- 신청 사전문항 — 문항 마스터·응답·자동채점 인프라
--
-- 외부 신청 시스템에서 받은 응답(엑셀)을 import해 채점·집계하기 위한 스키마.
-- 한 사람이 같은 기수의 여러 과정(트랙)에 지원·응답 가능 → application을
-- (applicant × cohort × track) 단위로 다중화.
--
-- 변경 요약:
--  1) applications에 track_id, 채점 집계 컬럼 추가 + unique 제약 갱신
--  2) application_questions (문항·정답·가중치 마스터) 신설
--  3) application_answers (응답 + 채점 결과) 신설
--  4) 기존 self_diagnosis jsonb 컬럼은 DEPRECATED 처리(이후 단계에서 제거)
-- =====================================================

-- 1) applications 확장 ---------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES public.tracks(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS knowledge_score NUMERIC,
  ADD COLUMN IF NOT EXISTS knowledge_correct_count INTEGER,
  ADD COLUMN IF NOT EXISTS knowledge_total_count INTEGER,
  ADD COLUMN IF NOT EXISTS self_diagnosis_avg NUMERIC;

CREATE INDEX IF NOT EXISTS applications_track_idx ON public.applications(track_id);

COMMENT ON COLUMN public.applications.track_id IS '응답한 과정(트랙). 같은 (applicant, cohort)에서 트랙별로 row가 다중 가능.';
COMMENT ON COLUMN public.applications.knowledge_score IS '지식평가 가중치 반영 총점. application_answers 집계.';
COMMENT ON COLUMN public.applications.knowledge_correct_count IS '지식평가 정답 수.';
COMMENT ON COLUMN public.applications.knowledge_total_count IS '지식평가 총 문항 수.';
COMMENT ON COLUMN public.applications.self_diagnosis_avg IS '자가진단(likert5) 평균 점수.';
COMMENT ON COLUMN public.applications.self_diagnosis IS 'DEPRECATED: application_answers로 이관 예정. 후속 마이그레이션에서 DROP.';

-- unique 제약 갱신: (applicant, cohort) → (applicant, cohort, track)
-- track_id NULL(미지정 legacy) 케이스도 중복 방지하기 위해 부분 인덱스 분리.
ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_applicant_cohort_key;

CREATE UNIQUE INDEX IF NOT EXISTS applications_applicant_cohort_track_unique_idx
  ON public.applications(applicant_id, cohort_id, track_id)
  WHERE track_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS applications_applicant_cohort_no_track_unique_idx
  ON public.applications(applicant_id, cohort_id)
  WHERE track_id IS NULL;


-- 2) application_questions ----------------------------------------------------
-- 운영자가 대시보드에서 관리하는 문항 마스터.
-- section: common | pre_learning | self_diagnosis | knowledge | usability | plan
-- question_type: single | multi | likert5 | text
-- track_id NULL = 공통문항(소속·직렬·즉시적용성 등)
CREATE TABLE IF NOT EXISTS public.application_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  question_no TEXT NOT NULL,
  difficulty TEXT,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  choices JSONB,
  correct_choice TEXT,
  weight NUMERIC NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_questions_cohort_track_idx
  ON public.application_questions(cohort_id, track_id);

-- 트랙 문항·공통문항 각각 unique (NULL distinct 회피 위해 부분 인덱스 분리)
CREATE UNIQUE INDEX IF NOT EXISTS application_questions_track_unique_idx
  ON public.application_questions(cohort_id, track_id, section, question_no)
  WHERE track_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS application_questions_common_unique_idx
  ON public.application_questions(cohort_id, section, question_no)
  WHERE track_id IS NULL;

CREATE TRIGGER application_questions_set_updated_at
  BEFORE UPDATE ON public.application_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_questions ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.application_questions.track_id IS 'NULL = 공통문항.';
COMMENT ON COLUMN public.application_questions.section IS 'common | pre_learning | self_diagnosis | knowledge | usability | plan';
COMMENT ON COLUMN public.application_questions.difficulty IS '지식평가만: beginner | intermediate | advanced';
COMMENT ON COLUMN public.application_questions.question_type IS 'single | multi | likert5 | text';
COMMENT ON COLUMN public.application_questions.choices IS 'single/multi 객관식 선택지: [{"key":"①","text":"..."}, ...]';
COMMENT ON COLUMN public.application_questions.correct_choice IS '지식평가 정답(choices의 key). NULL이면 채점 대상 아님.';
COMMENT ON COLUMN public.application_questions.weight IS '난이도/중요도 가중치. 점수 계산 시 곱셈 적용.';


-- 3) application_answers ------------------------------------------------------
-- 한 application의 한 문항 응답. 지식평가는 채점 결과(is_correct, score) 동시 저장.
CREATE TABLE IF NOT EXISTS public.application_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.application_questions(id) ON DELETE CASCADE,
  answer_value JSONB,
  is_correct BOOLEAN,
  score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT application_answers_app_question_key UNIQUE (application_id, question_id)
);

CREATE INDEX IF NOT EXISTS application_answers_application_idx
  ON public.application_answers(application_id);
CREATE INDEX IF NOT EXISTS application_answers_question_idx
  ON public.application_answers(question_id);

CREATE TRIGGER application_answers_set_updated_at
  BEFORE UPDATE ON public.application_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_answers ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.application_answers.answer_value IS 'single="③" / multi=["①","③"] / likert5=4 / text="..."';
COMMENT ON COLUMN public.application_answers.is_correct IS '지식평가만. correct_choice 비교 결과.';
COMMENT ON COLUMN public.application_answers.score IS '지식평가만. is_correct ? weight : 0.';
