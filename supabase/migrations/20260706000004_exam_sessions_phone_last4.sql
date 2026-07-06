-- 응시자 진입 시 이름 + 전화번호 뒷자리 4자리로 세션 매칭.
-- 승우님이 명단 등록 시 각 응시자의 phone_last4를 미리 저장.
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS phone_last4 text;

CREATE INDEX IF NOT EXISTS exam_sessions_exam_name_phone_idx
  ON public.exam_sessions (exam_id, name, phone_last4)
  WHERE phone_last4 IS NOT NULL;

COMMENT ON COLUMN public.exam_sessions.phone_last4 IS
  '응시자 진입 시 본인 확인용 전화번호 뒷 4자리. 공유 URL 접속 시 이름+뒷4자리 매칭에 사용.';
