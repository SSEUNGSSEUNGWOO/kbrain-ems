-- =====================================================
-- KBrain EMS — 초기 통합 스키마
-- 2026 NIA AI·데이터기반행정 역량강화 사업
--
-- 26개 테이블 + 공통 함수 + 모든 테이블 RLS 활성.
-- RLS 정책은 별도 마이그레이션에서 운영자 인증 도입 후 부여.
-- 현재는 service_role 키로 서버 코드에서만 접근하는 전제.
-- =====================================================

-- =====================================================
-- 0) Extensions + 공통 함수
-- =====================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- 1) 운영자
-- =====================================================
CREATE TABLE operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX operators_name_unique_idx ON operators(name);


-- =====================================================
-- 2) 마스터 (기관·기수)
-- =====================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizations_name_unique_idx ON organizations(name);
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  started_at DATE,
  ended_at DATE,
  application_start_at DATE,
  application_end_at DATE,
  recruiting_slug TEXT,
  max_capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cohorts_name_unique_idx ON cohorts(name);
CREATE UNIQUE INDEX cohorts_recruiting_slug_unique_idx
  ON cohorts(recruiting_slug) WHERE recruiting_slug IS NOT NULL;
CREATE TRIGGER cohorts_set_updated_at
  BEFORE UPDATE ON cohorts FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 3) 트랙 (cohort 의존)
-- =====================================================
CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  min_score INTEGER,
  max_score INTEGER,
  prereq_required BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tracks_cohort_code_key UNIQUE (cohort_id, code)
);
CREATE INDEX tracks_cohort_idx ON tracks(cohort_id);
CREATE TRIGGER tracks_set_updated_at
  BEFORE UPDATE ON tracks FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 4) 지원자·지원이력 (모집·선발)
-- =====================================================
CREATE TABLE applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  department TEXT,
  job_title TEXT,
  job_role TEXT,
  birth_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX applicants_organization_idx ON applicants(organization_id);
CREATE TRIGGER applicants_set_updated_at
  BEFORE UPDATE ON applicants FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'applied',
  rejected_stage TEXT,
  applied_at DATE,
  decided_at DATE,
  note TEXT,
  self_diagnosis JSONB,
  recommended_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  motivation TEXT,
  related_work_years INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT applications_applicant_cohort_key UNIQUE (applicant_id, cohort_id)
);
CREATE INDEX applications_applicant_idx ON applications(applicant_id);
CREATE INDEX applications_cohort_idx ON applications(cohort_id);
CREATE INDEX applications_recommended_track_idx ON applications(recommended_track_id);
CREATE TRIGGER applications_set_updated_at
  BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 5) 교육생 (applicant 승격, id 공유)
-- =====================================================
CREATE TABLE students (
  id UUID PRIMARY KEY REFERENCES applicants(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department TEXT,
  job_title TEXT,
  job_role TEXT,
  birth_date DATE,
  notes TEXT,
  assigned_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX students_cohort_idx ON students(cohort_id);
CREATE INDEX students_organization_idx ON students(organization_id);
CREATE INDEX students_assigned_track_idx ON students(assigned_track_id);
CREATE TRIGGER students_set_updated_at
  BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 6) 수업·출결·과제
-- =====================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  title TEXT,
  start_time TIME,
  end_time TIME,
  break_minutes INTEGER DEFAULT 0,
  break_start_time TIME,
  break_end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER sessions_set_updated_at
  BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'absent',
  note TEXT,
  arrival_time TIME,
  departure_time TIME,
  credited_hours NUMERIC(4, 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_session_student_key UNIQUE (session_id, student_id)
);
CREATE TRIGGER attendance_records_set_updated_at
  BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER assignments_set_updated_at
  BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_submitted',
  submitted_at DATE,
  score NUMERIC(5, 1),
  note TEXT,
  file_path TEXT,
  file_name TEXT,
  file_size BIGINT,
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assignment_submissions_assignment_student_key UNIQUE (assignment_id, student_id)
);
CREATE TRIGGER assignment_submissions_set_updated_at
  BEFORE UPDATE ON assignment_submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 7) 강사·강사료
-- =====================================================
CREATE TABLE instructor_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hourly_rate NUMERIC(10, 0),
  daily_limit_hours NUMERIC(4, 1),
  daily_limit_amount NUMERIC(12, 0),
  effective_from DATE,
  effective_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER instructor_grades_set_updated_at
  BEFORE UPDATE ON instructor_grades FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  affiliation TEXT,
  specialty TEXT,
  grade_id UUID REFERENCES instructor_grades(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX instructors_grade_idx ON instructors(grade_id);
CREATE TRIGGER instructors_set_updated_at
  BEFORE UPDATE ON instructors FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE session_instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'main',
  hours NUMERIC(4, 1),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_instructors_unique UNIQUE (session_id, instructor_id, role)
);
CREATE INDEX session_instructors_session_idx ON session_instructors(session_id);
CREATE INDEX session_instructors_instructor_idx ON session_instructors(instructor_id);
CREATE TRIGGER session_instructors_set_updated_at
  BEFORE UPDATE ON session_instructors FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE instructor_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_instructor_id UUID NOT NULL REFERENCES session_instructors(id) ON DELETE CASCADE,
  hourly_rate NUMERIC(10, 0),
  hours NUMERIC(4, 1),
  calculated_amount NUMERIC(12, 0),
  approved_amount NUMERIC(12, 0),
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES operators(id) ON DELETE SET NULL,
  paid_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX instructor_fees_session_instructor_idx ON instructor_fees(session_instructor_id);
CREATE INDEX instructor_fees_status_idx ON instructor_fees(status);
CREATE TRIGGER instructor_fees_set_updated_at
  BEFORE UPDATE ON instructor_fees FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 8) 만족도 설문
-- =====================================================
CREATE TABLE surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  scope TEXT,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX surveys_cohort_idx ON surveys(cohort_id);
CREATE TRIGGER surveys_set_updated_at
  BEFORE UPDATE ON surveys FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_no INTEGER NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  options JSONB,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT survey_questions_survey_no_key UNIQUE (survey_id, question_no)
);
CREATE INDEX survey_questions_survey_idx ON survey_questions(survey_id);
CREATE TRIGGER survey_questions_set_updated_at
  BEFORE UPDATE ON survey_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  responses JSONB,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT survey_responses_survey_student_key UNIQUE (survey_id, student_id)
);
CREATE INDEX survey_responses_survey_idx ON survey_responses(survey_id);
CREATE INDEX survey_responses_student_idx ON survey_responses(student_id);
CREATE TRIGGER survey_responses_set_updated_at
  BEFORE UPDATE ON survey_responses FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 9) 사전·사후 진단
-- =====================================================
CREATE TABLE diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX diagnoses_cohort_idx ON diagnoses(cohort_id);
CREATE TRIGGER diagnoses_set_updated_at
  BEFORE UPDATE ON diagnoses FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE diagnosis_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id UUID NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
  question_no INTEGER NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  options JSONB,
  weight NUMERIC(5, 2) DEFAULT 1.0,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT diagnosis_questions_diagnosis_no_key UNIQUE (diagnosis_id, question_no)
);
CREATE INDEX diagnosis_questions_diagnosis_idx ON diagnosis_questions(diagnosis_id);
CREATE TRIGGER diagnosis_questions_set_updated_at
  BEFORE UPDATE ON diagnosis_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE diagnosis_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id UUID NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  responses JSONB,
  total_score NUMERIC(8, 2),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT diagnosis_responses_diagnosis_student_key UNIQUE (diagnosis_id, student_id)
);
CREATE INDEX diagnosis_responses_diagnosis_idx ON diagnosis_responses(diagnosis_id);
CREATE INDEX diagnosis_responses_student_idx ON diagnosis_responses(student_id);
CREATE TRIGGER diagnosis_responses_set_updated_at
  BEFORE UPDATE ON diagnosis_responses FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 10) 평가위원·평가 (선발)
-- =====================================================
CREATE TABLE evaluators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  anonymous_code TEXT,
  affiliation TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evaluators_cohort_code_key UNIQUE (cohort_id, anonymous_code)
);
CREATE INDEX evaluators_cohort_idx ON evaluators(cohort_id);
CREATE TRIGGER evaluators_set_updated_at
  BEFORE UPDATE ON evaluators FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_id UUID NOT NULL REFERENCES evaluators(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  score NUMERIC(5, 2),
  scores JSONB,
  comments TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evaluations_evaluator_application_key UNIQUE (evaluator_id, application_id)
);
CREATE INDEX evaluations_evaluator_idx ON evaluations(evaluator_id);
CREATE INDEX evaluations_application_idx ON evaluations(application_id);
CREATE TRIGGER evaluations_set_updated_at
  BEFORE UPDATE ON evaluations FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 11) 결과보고서·알림
-- =====================================================
CREATE TABLE cohort_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT,
  content JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  file_path TEXT,
  draft_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cohort_reports_cohort_idx ON cohort_reports(cohort_id);
CREATE INDEX cohort_reports_status_idx ON cohort_reports(status);
CREATE TRIGGER cohort_reports_set_updated_at
  BEFORE UPDATE ON cohort_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  recipient_type TEXT NOT NULL,
  recipient_id UUID,
  channel TEXT NOT NULL,
  template_code TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  external_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_cohort_idx ON notifications(cohort_id);
CREATE INDEX notifications_recipient_idx ON notifications(recipient_type, recipient_id);
CREATE INDEX notifications_status_idx ON notifications(status);
CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 12) 리스크·이슈
-- =====================================================
CREATE TABLE risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT,
  description TEXT,
  likelihood TEXT,
  impact TEXT,
  mitigation TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  owner_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX risks_status_idx ON risks(status);
CREATE TRIGGER risks_set_updated_at
  BEFORE UPDATE ON risks FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT,
  related_cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  reported_at DATE,
  resolved_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX issues_status_idx ON issues(status);
CREATE INDEX issues_cohort_idx ON issues(related_cohort_id);
CREATE TRIGGER issues_set_updated_at
  BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 13) RLS 활성 (정책 없음 = anon 모두 거부, service_role만 통과)
--
-- 운영자 인증 도입 후 별도 마이그레이션에서 정책 부여 예정.
-- 공개 라우트(/apply, /survey, /diagnosis)도 서버 코드에서
-- service_role 키로 작업하는 전제.
-- =====================================================
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosis_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosis_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluators ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
