-- 사전 세팅 체크리스트 — 입과 전 학생이 무인증으로 응답하는 yes/no 자가진단.
-- 예: AI·파이썬 실습 과정에서 Zoom 설치, ChatGPT/Gemini 가입 등 사전 준비 확인.
-- 만족도 설문(익명) / 진단(student_id 식별) 어느 쪽도 사용처가 안 맞아 별도 도메인.

CREATE TABLE IF NOT EXISTS public.pretraining_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  guide_url text,
  share_code text,
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pretraining_checklists_share_code_unique
  ON public.pretraining_checklists(share_code)
  WHERE share_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS pretraining_checklists_cohort_id_idx
  ON public.pretraining_checklists(cohort_id);

CREATE TABLE IF NOT EXISTS public.pretraining_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.pretraining_checklists(id) ON DELETE CASCADE,
  question_no text NOT NULL,
  text text NOT NULL,
  guide_url text,
  -- 부모 항목의 특정 답일 때만 노출되는 후속 분기. parent_id NULL = 항상 노출.
  parent_id uuid REFERENCES public.pretraining_checklist_items(id) ON DELETE CASCADE,
  parent_answer text,
  no_hint text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pretraining_checklist_items_checklist_id_idx
  ON public.pretraining_checklist_items(checklist_id);

CREATE TABLE IF NOT EXISTS public.pretraining_checklist_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.pretraining_checklists(id) ON DELETE CASCADE,
  name text NOT NULL,
  organization text,
  phone text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pretraining_checklist_responses_checklist_id_idx
  ON public.pretraining_checklist_responses(checklist_id);
CREATE INDEX IF NOT EXISTS pretraining_checklist_responses_submitted_at_idx
  ON public.pretraining_checklist_responses(submitted_at DESC);

ALTER TABLE public.pretraining_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pretraining_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pretraining_checklist_responses ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pretraining_checklists IS
  '사전 세팅 체크리스트 마스터 (cohort 별). share_code 로 무인증 응답 페이지 접근.';
COMMENT ON TABLE public.pretraining_checklist_items IS
  '체크리스트 항목 (yes/no). parent_id/parent_answer 로 조건부 후속 분기.';
COMMENT ON TABLE public.pretraining_checklist_responses IS
  '학생 응답 — 이름/소속/전화로 식별, answers 는 {item_id: ''yes''|''no''} jsonb.';
