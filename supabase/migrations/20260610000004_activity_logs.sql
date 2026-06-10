-- 운영자 활동 로그 — 누가 언제 무엇을 변경했는지 추적.
-- 로그인 + 주요 데이터 변경 (cohort/학생/지원자/선발/만족도/공유) 만 기록.

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES public.operators(id) ON DELETE SET NULL,
  -- 운영자 row 가 삭제돼도 누구였는지는 보이도록 이름 스냅샷 저장
  operator_name text,
  action_type text NOT NULL,
  resource_type text,
  resource_id uuid,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_operator_id_idx
  ON public.activity_logs(operator_id);
CREATE INDEX IF NOT EXISTS activity_logs_cohort_id_idx
  ON public.activity_logs(cohort_id);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.activity_logs IS
  '운영자 활동 로그 — 로그인 + 주요 데이터 변경 (cohort/학생/지원자/선발/만족도/공유) 만.';
COMMENT ON COLUMN public.activity_logs.action_type IS
  '예: login, create, update, delete, publish, share_issue, share_revoke, auto_select';
COMMENT ON COLUMN public.activity_logs.summary IS
  '사람이 읽을 한 줄 요약 (예: "전문인재 26-1 만족도 설문 발행").';
