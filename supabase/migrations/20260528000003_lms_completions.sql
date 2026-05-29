-- LMS 사전학습 수료자 명단.
-- 우리 사이트(같은 운영주체) LMS 수료자를 매칭용 reference로 보관.
-- 매칭 키: 휴대폰(정규화) 1차 → 이메일 2차.
-- 보관 컬럼은 매칭에 필요한 최소 정보만 (이름·휴대폰·이메일·과정·수료여부·수료일·수료번호).

CREATE TABLE IF NOT EXISTS public.lms_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code     TEXT NOT NULL,             -- 'ai_literacy' | 'data_literacy' (확장 가능)
  course_name     TEXT NOT NULL,             -- 외부 명단 원본 과정명 그대로
  name            TEXT NOT NULL,
  phone           TEXT,                      -- 정규화된 숫자만 (010xxxxxxxx)
  email           TEXT,
  completed       BOOLEAN NOT NULL DEFAULT true,
  completed_at    DATE,
  certificate_no  TEXT,                      -- 수료번호 (LMS 측 unique)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 중복 방지: 같은 과목·수료번호는 한 row만 (재import 시 upsert 기준)
CREATE UNIQUE INDEX IF NOT EXISTS lms_completions_course_cert_unique_idx
  ON public.lms_completions(course_code, certificate_no)
  WHERE certificate_no IS NOT NULL;

-- 매칭 검색용 인덱스
CREATE INDEX IF NOT EXISTS lms_completions_phone_idx
  ON public.lms_completions(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS lms_completions_email_idx
  ON public.lms_completions(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS lms_completions_course_idx
  ON public.lms_completions(course_code);

CREATE TRIGGER lms_completions_set_updated_at
  BEFORE UPDATE ON public.lms_completions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lms_completions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lms_completions IS
  'LMS 사전학습 수료자 명단. 신청자(applicants)와 휴대폰·이메일로 매칭하여 사전학습 이수 여부 검증.';
COMMENT ON COLUMN public.lms_completions.course_code IS '과정 식별 코드 (예: ai_literacy, data_literacy)';
COMMENT ON COLUMN public.lms_completions.phone IS '정규화된 휴대폰 (하이픈·공백 제거된 숫자만)';
COMMENT ON COLUMN public.lms_completions.certificate_no IS 'LMS 측 수료번호. course_code와 함께 unique.';
