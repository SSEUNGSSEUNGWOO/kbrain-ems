-- =====================================================
-- 모집 라운드 — 1차/2차/.../N차 모집 그룹.
-- 같은 라운드에 묶인 cohort들은 동일한 신청기간·선발일·통보일을 공유.
--
-- 출처: docs/EMS/260511_교육 일정 세부표.hwp 표 헤더.
-- 일정 변경 시 라운드 row 1개만 수정해 모든 매핑 cohort에 전파.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.recruitment_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_no INTEGER NOT NULL,
  label TEXT,
  application_start_at DATE,
  application_end_at DATE,
  selection_at DATE,
  announce_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_rounds_round_no_key UNIQUE (round_no)
);

CREATE TRIGGER recruitment_rounds_set_updated_at
  BEFORE UPDATE ON public.recruitment_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.recruitment_rounds ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.recruitment_rounds.round_no IS '1, 2, 3, ... 모집 차수';
COMMENT ON COLUMN public.recruitment_rounds.label IS '표시용 라벨. 예: "1차 모집"';
COMMENT ON COLUMN public.recruitment_rounds.selection_at IS '선발일 (심사 완료일).';
COMMENT ON COLUMN public.recruitment_rounds.announce_at IS '선발통보일 (지원자 안내일).';
COMMENT ON COLUMN public.recruitment_rounds.note IS '비고 — 어떤 과정 묶음인지, 특이사항 등.';

-- cohorts 매핑
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS recruitment_round_id UUID
    REFERENCES public.recruitment_rounds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cohorts_recruitment_round_idx
  ON public.cohorts(recruitment_round_id);

COMMENT ON COLUMN public.cohorts.recruitment_round_id IS '소속 모집 라운드. 라운드의 신청기간·선발일·통보일을 공유.';
