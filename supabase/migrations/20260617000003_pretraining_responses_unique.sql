-- 동시 제출(더블클릭·재시도)로 인한 중복 row 방지.
-- student_id 가 NULL 인 익명 응답은 unique 대상 외이라 partial.
create unique index if not exists idx_pretraining_responses_checklist_student
  on pretraining_checklist_responses(checklist_id, student_id)
  where student_id is not null;
