-- 기존 학생들을 applicants/applications로 복제 (id 유지)
-- 이후 students.id가 applicants.id의 자식이 되도록 FK 추가

-- 1) students → applicants 복사 (id 유지, 중복 시 스킵)
INSERT INTO applicants (
  id, name, email, phone, organization_id, department, job_title, job_role, birth_date, notes
)
SELECT
  id, name, email, phone, organization_id, department, job_title, job_role, birth_date, notes
FROM students
ON CONFLICT (id) DO NOTHING;

-- 2) 각 학생-기수 조합에 대해 'selected' 이력 생성 (중복 시 스킵)
INSERT INTO applications (
  applicant_id, cohort_id, status, decided_at
)
SELECT
  id, cohort_id, 'selected', NULL
FROM students
ON CONFLICT (applicant_id, cohort_id) DO NOTHING;

-- 3) students.id가 applicants.id의 자식이 되도록 FK 추가
--    이후 applicants 삭제 시 students도 cascade
ALTER TABLE students
  ADD CONSTRAINT students_applicant_id_fkey
  FOREIGN KEY (id) REFERENCES applicants(id) ON DELETE CASCADE;
