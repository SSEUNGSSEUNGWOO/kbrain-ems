-- 전문인재 실전평가 등 대규모 CBT 시스템.
-- 문제은행(exam_banks/exam_questions) + 시험 세트(exams/exam_questions_in_exam)
-- + 응시(exam_sessions/exam_responses) 6개 테이블 + Supabase Storage 버킷.

-- 1. 문제은행
CREATE TABLE IF NOT EXISTS public.exam_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. 문항
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES public.exam_banks(id) ON DELETE CASCADE,
  code text,
  category text,
  grade text,
  difficulty text,
  type text NOT NULL CHECK (type IN ('multiple_choice', 'short_text', 'task_based')),
  text text NOT NULL,
  score int NOT NULL DEFAULT 1,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  choices jsonb,
  correct jsonb,
  allow_file_upload boolean NOT NULL DEFAULT false,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_questions_bank_code_key
  ON public.exam_questions(bank_id, code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS exam_questions_bank_idx ON public.exam_questions(bank_id);

-- 3. 시험 세트
CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  time_limit_minutes int,
  fullscreen_required boolean NOT NULL DEFAULT false,
  share_code text,
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exams_share_code_key
  ON public.exams(share_code) WHERE share_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS exams_cohort_idx ON public.exams(cohort_id) WHERE cohort_id IS NOT NULL;

-- 4. 시험 ↔ 문항 M:N + 표시 순서
CREATE TABLE IF NOT EXISTS public.exam_questions_in_exam (
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  order_no int NOT NULL,
  PRIMARY KEY (exam_id, question_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_qie_order_key
  ON public.exam_questions_in_exam(exam_id, order_no);

-- 5. 응시 세션
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  token text,
  name text,
  email text,
  started_at timestamptz,
  submitted_at timestamptz,
  auto_score numeric,
  manual_score numeric,
  total_score numeric,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'graded')),
  browser_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_sessions_token_key
  ON public.exam_sessions(token) WHERE token IS NOT NULL;
CREATE INDEX IF NOT EXISTS exam_sessions_exam_idx ON public.exam_sessions(exam_id);
CREATE INDEX IF NOT EXISTS exam_sessions_student_idx
  ON public.exam_sessions(student_id) WHERE student_id IS NOT NULL;

-- 6. 문항별 응답
CREATE TABLE IF NOT EXISTS public.exam_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  answer_value jsonb,
  auto_score numeric,
  manual_score numeric,
  feedback text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS exam_responses_session_idx ON public.exam_responses(session_id);

-- Supabase Storage 버킷 (작업형 파일 업로드)
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-submissions', 'exam-submissions', false)
ON CONFLICT (id) DO NOTHING;

-- 코멘트
COMMENT ON TABLE public.exam_banks IS '문제은행. 여러 카테고리·등급을 하나의 뱅크에 담을 수 있음.';
COMMENT ON TABLE public.exam_questions IS '문항. type=multiple_choice/short_text/task_based.';
COMMENT ON TABLE public.exams IS '시험 세트. 뱅크 문항 중 일부를 순서로 골라 시험 구성.';
COMMENT ON TABLE public.exam_questions_in_exam IS '시험×문항 매핑 + 표시 순서.';
COMMENT ON TABLE public.exam_sessions IS '응시 세션. token(개별) 또는 name/email(공유) 진입.';
COMMENT ON TABLE public.exam_responses IS '문항별 응답. answer_value는 유형별 shape 다름.';

COMMENT ON COLUMN public.exam_questions.choices IS 'multiple_choice: [{key,text},...] · 그 외 null';
COMMENT ON COLUMN public.exam_questions.correct IS 'multiple_choice: {key:"②"} / short_text: {keywords:[...]} / task_based: null(수동채점)';
COMMENT ON COLUMN public.exam_responses.answer_value IS 'multiple_choice: {key} / short_text: {text} / task_based: {file_path,notes,url}';
COMMENT ON COLUMN public.exam_sessions.browser_events IS '전체화면 이탈·복귀 등 부정행위 방지용 이벤트 로그';
