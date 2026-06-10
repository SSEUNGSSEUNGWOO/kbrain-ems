-- 사전 세팅 체크리스트 응답을 학생 마스터와 연결.
-- 공개 응답 페이지는 이름 + 전화 끝 4자리로 students 매칭 후 진입 (필수).

ALTER TABLE public.pretraining_checklist_responses
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pretraining_checklist_responses_student_id_idx
  ON public.pretraining_checklist_responses(student_id);

COMMENT ON COLUMN public.pretraining_checklist_responses.student_id IS
  '응답자의 students.id (이름 + 전화 뒷 4자리 매칭). 학생 행이 삭제돼도 이름/전화 스냅샷은 남음.';
