-- 출석 체크포인트가 attendance_records 에 자동 반영되도록 역할·정시기준 추가.
ALTER TABLE attendance_checks
  ADD COLUMN criterion_at TIMESTAMPTZ,
  ADD COLUMN attendance_role TEXT;

COMMENT ON COLUMN attendance_checks.criterion_at IS
  '정시 기준 시각. 학생 체크인 시각이 이 시각보다 늦으면 지각으로 표시.';
COMMENT ON COLUMN attendance_checks.attendance_role IS
  'arrival=출석 status 자동 결정(present/late), departure=조퇴/마감 확인용, null=기록만.';
