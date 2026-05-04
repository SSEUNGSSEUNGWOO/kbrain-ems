-- =====================================================
-- 출결 시간 추적: sessions 시간 추가, attendance_records 확장
-- =====================================================

-- 1) sessions: 수업 시작/종료 시간
ALTER TABLE public.sessions ADD COLUMN start_time time;
ALTER TABLE public.sessions ADD COLUMN end_time time;

-- 2) attendance_records: 지각 도착 / 조퇴 퇴장 / 인정시간
ALTER TABLE public.attendance_records ADD COLUMN arrival_time time;
ALTER TABLE public.attendance_records ADD COLUMN departure_time time;
ALTER TABLE public.attendance_records ADD COLUMN credited_hours numeric(4,1);

-- 3) status 체크 제약에 조퇴(early_leave) 추가
ALTER TABLE public.attendance_records DROP CONSTRAINT attendance_records_status_check;
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('present', 'absent', 'late', 'early_leave', 'excused'));
