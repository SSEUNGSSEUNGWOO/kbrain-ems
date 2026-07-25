-- 외부 사이트에서 실시된 AI챔피언 인증평가 결과를 담는 테이블.
--
-- 시험은 외부 사이트에서 봄. 결과 엑셀을 EMS 로 import → 학생 매칭 → 인증 페이지에서 표시.
-- 세부 점수는 cohort/시험마다 섹션 구성이 달라질 수 있어 jsonb 로 유연 저장.

CREATE TABLE IF NOT EXISTS public.certification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,

  -- 원본 매칭 키 (student 매칭 실패 시 fallback + 재매칭용)
  name TEXT NOT NULL,
  phone TEXT,          -- 정규화 숫자만 (010xxxxxxxx)
  email TEXT,

  -- 결과
  passed BOOLEAN,
  total_score NUMERIC(6, 2),
  grade TEXT,
  section_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- shape 예: { "객관식": 45, "서술형": 20, "작업형": 15 } — 섹션명은 cohort/시험마다 다를 수 있음

  -- 시험 메타
  exam_no TEXT,        -- 개별 수험번호 (외부 사이트 발급)
  cert_no TEXT,        -- 발급 인증번호 (합격자만)
  exam_date DATE,

  raw JSONB,           -- 엑셀 원본 row (감사·재파싱용)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 cohort × 학생은 하나의 결과 (재응시 없다고 가정, 있으면 나중에 relax)
CREATE UNIQUE INDEX IF NOT EXISTS certification_results_cohort_student_key
  ON public.certification_results (cohort_id, student_id)
  WHERE student_id IS NOT NULL;

-- 같은 cohort × 인증번호도 unique (발급 오류 방지)
CREATE UNIQUE INDEX IF NOT EXISTS certification_results_cohort_cert_key
  ON public.certification_results (cohort_id, cert_no)
  WHERE cert_no IS NOT NULL;

-- 재매칭 조회용
CREATE INDEX IF NOT EXISTS certification_results_cohort_idx
  ON public.certification_results (cohort_id);
CREATE INDEX IF NOT EXISTS certification_results_phone_idx
  ON public.certification_results (phone)
  WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS certification_results_email_idx
  ON public.certification_results (email)
  WHERE email IS NOT NULL;

CREATE TRIGGER certification_results_set_updated_at
  BEFORE UPDATE ON public.certification_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.certification_results ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.certification_results IS
  '외부 사이트 인증평가 결과. 엑셀 import 로 채워지고 인증 페이지에서 학생별 표시.';
COMMENT ON COLUMN public.certification_results.section_scores IS
  '섹션/영역별 세부 점수 jsonb. shape 는 cohort/시험마다 다를 수 있음.';
COMMENT ON COLUMN public.certification_results.raw IS
  '엑셀 원본 row 스냅샷. 매핑 오류 발견 시 재파싱 참고용.';
