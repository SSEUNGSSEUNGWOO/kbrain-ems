-- =====================================================
-- surveys.share_code — 공용 카톡 링크용 short slug
--
-- 카톡방에 공유할 URL: /survey/share/{share_code}
-- 학생이 클릭 → 본인 식별 (이름 입력) → 응답 페이지로 redirect
-- =====================================================

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS share_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS surveys_share_code_unique_idx
  ON surveys(share_code) WHERE share_code IS NOT NULL;

-- 5/7 만족도 설문 share_code 부여
UPDATE surveys
SET share_code = 'aichamp-26-1-577'
WHERE title = '2026 AI 챔피언 고급 과정(5.7) 만족도 조사'
  AND share_code IS NULL;
