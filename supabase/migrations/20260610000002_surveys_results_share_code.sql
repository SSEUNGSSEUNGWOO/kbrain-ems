-- 만족도 설문 결과를 발주처 등 외부 이해관계자에게 공유하기 위한 무인증 share_code.
-- 운영자가 결과 페이지에서 발급/회수하며, 발급된 코드로 /survey-results/[code] 공개 라우트에 접근.

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS results_share_code text;

CREATE UNIQUE INDEX IF NOT EXISTS surveys_results_share_code_unique
  ON public.surveys(results_share_code)
  WHERE results_share_code IS NOT NULL;

COMMENT ON COLUMN public.surveys.results_share_code IS
  '결과 공개 공유 코드. /survey-results/[code] 공개 라우트 진입에 사용. NULL = 비공개.';
