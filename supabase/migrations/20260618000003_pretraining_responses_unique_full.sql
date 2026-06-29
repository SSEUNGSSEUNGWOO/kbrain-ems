-- 사전세팅체크 응답 제출 시 ON CONFLICT 오류 수정.
--
-- 기존 partial unique index (WHERE student_id IS NOT NULL) 는
-- PostgreSQL ON CONFLICT 매칭에 INSERT 측 WHERE 명시가 필요한데
-- supabase-js upsert 는 컬럼 목록만 받아 partial 매칭이 불가능.
-- → 일반 unique constraint 로 교체. NULL 은 기본적으로 distinct 처리되므로
--   익명 응답(student_id NULL) 다중 row 허용 의도는 그대로 유지됨.

DROP INDEX IF EXISTS idx_pretraining_responses_checklist_student;

ALTER TABLE pretraining_checklist_responses
  ADD CONSTRAINT pretraining_checklist_responses_checklist_student_key
  UNIQUE (checklist_id, student_id);
