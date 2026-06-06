-- 세션 내 임의 시점(오전 시작, 점심 후, 마감 등)에 학생이 share 링크로 셀프 체크인하는 출석 체크포인트.
-- 기존 attendance_records 는 운영자가 수동 입력하는 종합 출결 상태를 그대로 유지하고,
-- 이 테이블은 "그 시점에 자리에 있었음" 만 timestamp 로 누적 기록.

CREATE TABLE attendance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  share_code TEXT,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX attendance_checks_share_code_unique
  ON attendance_checks(share_code) WHERE share_code IS NOT NULL;
CREATE INDEX attendance_checks_session_idx ON attendance_checks(session_id);
CREATE TRIGGER attendance_checks_set_updated_at
  BEFORE UPDATE ON attendance_checks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE attendance_checks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE attendance_checks IS
  '세션 내 셀프 체크인 포인트. 한 세션에 N개 가능 (예: 오전/점심후/마감).';
COMMENT ON COLUMN attendance_checks.label IS '운영자 정의 라벨 (예: 오전 시작, 점심 후, 마감)';
COMMENT ON COLUMN attendance_checks.share_code IS '학생용 공유 진입 코드. NULL=공유 비활성.';

CREATE TABLE attendance_check_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES attendance_checks(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_check_records_check_student_key UNIQUE (check_id, student_id)
);
CREATE INDEX attendance_check_records_check_idx ON attendance_check_records(check_id);
CREATE INDEX attendance_check_records_student_idx ON attendance_check_records(student_id);

ALTER TABLE attendance_check_records ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE attendance_check_records IS
  '학생 셀프 체크인 기록. checked_at 은 학생이 share 링크 클릭한 시각.';
