-- exam_sessions에 (exam_id, student_id) UNIQUE 제약 추가.
-- 이유: 응시자가 공유 URL로 두 번 진입 시 race condition으로 세션이 중복 발급되는 문제 방지.
-- share/[code]/_actions.ts에서 select → check → insert 방식이라 원자적이지 않음.
-- unique index로 DB 레벨 방어.
--
-- Partial index: student_id가 NULL인 경우(테스트 세션 등)는 제외.

CREATE UNIQUE INDEX IF NOT EXISTS exam_sessions_exam_student_unique
  ON public.exam_sessions(exam_id, student_id)
  WHERE student_id IS NOT NULL;
