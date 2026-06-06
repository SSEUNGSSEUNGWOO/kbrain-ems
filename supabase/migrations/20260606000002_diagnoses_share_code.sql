-- 진단 공유 진입 코드 — /diagnosis/share/[code] 에서 이름 입력 후 학생 매칭
ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS share_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS diagnoses_share_code_unique
  ON diagnoses(share_code)
  WHERE share_code IS NOT NULL;

COMMENT ON COLUMN diagnoses.share_code IS
  '공유 진입 페이지 코드. NULL=공유 비활성, 값 있으면 /diagnosis/share/{code} 로 진입 가능.';
