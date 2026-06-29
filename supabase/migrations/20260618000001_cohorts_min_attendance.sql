-- 수료 판정 최소 출석 회차를 기수별로 저장.
-- NULL = 페이지 기본값(3) 사용. 일반교육(1회성)은 1로 저장해두면 매번 URL ?min 지정 불필요.

ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS min_attendance INTEGER;

COMMENT ON COLUMN cohorts.min_attendance IS
  '수료 판정 최소 출석 회차. NULL이면 수료 페이지 기본값(3) 사용. 일반교육 단발 cohort는 1로 저장.';
