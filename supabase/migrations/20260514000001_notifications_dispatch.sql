-- 입과안내 발송 체크리스트 확장.
-- 운영자 식별 + 다중 채널 표현 + 표준 template_code 주석.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS sent_by_operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channels TEXT[];

CREATE INDEX IF NOT EXISTS notifications_template_idx ON notifications(cohort_id, template_code);

COMMENT ON COLUMN notifications.template_code IS
  '표준값: d7_orientation | d3_prereq_check | d1_reminder | d0_arrival (입과안내 단계). 기타 발송 유형은 자유.';
COMMENT ON COLUMN notifications.channels IS
  '다중 채널 표현. 예: {email,sms,kakao}. 단일 채널 row면 NULL이고 channel 컬럼만 사용.';
COMMENT ON COLUMN notifications.sent_by_operator_id IS
  '발송 처리(체크리스트 체크)를 수행한 운영자.';
