-- 공유 진입 페이지(/survey/share/[code])에서 cohort 이름 대신 표시할 부제.
-- 1기·2기 통합 설문처럼 단일 cohort 라벨이 오해를 부를 때 사용.
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS share_subtitle TEXT;

COMMENT ON COLUMN surveys.share_subtitle IS
  '공유 진입 페이지에서 cohort 이름 대신 표시할 부제. NULL이면 cohort.name 사용.';
