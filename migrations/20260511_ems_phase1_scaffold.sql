-- =====================================================
-- EMS Phase 1 Scaffold
-- 2026 NIA AI·데이터기반행정 역량강화 사업 요건사항 매핑
--
-- 추가 영역:
--  · 트랙 (자가진단 추천·세분)
--  · 강사 마스터·등급·세션매핑·강사료
--  · 설문 (만족도)
--  · 진단 (사전·사후)
--  · 평가위원·평가
--  · 결과보고서
--  · 알림 발송 로그
--  · 리스크·이슈
--
-- 비즈니스 로직(트랙 매핑 룰·등급 단가·문항 내용)은 데이터로 별도 입력.
-- 이 파일은 스키마 골격만 정의.
-- =====================================================

-- =====================================================
-- 1) 트랙 마스터 (cohort × track)
-- =====================================================
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                       -- 'track1' | 'track2' | 'track3'
  name TEXT NOT NULL,                       -- 표시 이름 (예: '입문', '중급', '고급')
  description TEXT,
  min_score INTEGER,                        -- 자가진단 추천 최소 점수
  max_score INTEGER,                        -- 자가진단 추천 최대 점수
  prereq_required BOOLEAN NOT NULL DEFAULT false,  -- 사전이수 의무 여부
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tracks_cohort_code_key UNIQUE (cohort_id, code)
);

CREATE INDEX IF NOT EXISTS tracks_cohort_idx ON tracks(cohort_id);

CREATE TRIGGER tracks_set_updated_at
  BEFORE UPDATE ON tracks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 2) 강사 마스터 + 등급 + 세션매핑 + 강사료
-- =====================================================
CREATE TABLE IF NOT EXISTS instructor_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,                -- 'special' | 'level1' | 'level2' | 'level3'
  name TEXT NOT NULL,                       -- '특급' | '1급' | '2급' | '3급'
  hourly_rate NUMERIC(10, 0),               -- 시간당 단가 (원)
  daily_limit_hours NUMERIC(4, 1),          -- 일일 한도 시간
  daily_limit_amount NUMERIC(12, 0),        -- 일일 한도 금액
  effective_from DATE,
  effective_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER instructor_grades_set_updated_at
  BEFORE UPDATE ON instructor_grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  affiliation TEXT,                         -- 소속
  specialty TEXT,                           -- 전공·전문분야
  grade_id UUID REFERENCES instructor_grades(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instructors_grade_idx ON instructors(grade_id);

CREATE TRIGGER instructors_set_updated_at
  BEFORE UPDATE ON instructors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS session_instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'main',        -- 'main' | 'sub' | 'tutor'
  hours NUMERIC(4, 1),                      -- 강의 시간
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_instructors_unique UNIQUE (session_id, instructor_id, role)
);

CREATE INDEX IF NOT EXISTS session_instructors_session_idx ON session_instructors(session_id);
CREATE INDEX IF NOT EXISTS session_instructors_instructor_idx ON session_instructors(instructor_id);

CREATE TRIGGER session_instructors_set_updated_at
  BEFORE UPDATE ON session_instructors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS instructor_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_instructor_id UUID NOT NULL REFERENCES session_instructors(id) ON DELETE CASCADE,
  hourly_rate NUMERIC(10, 0),               -- 산정 시점 시급 (등급 변경 대비 스냅샷)
  hours NUMERIC(4, 1),
  calculated_amount NUMERIC(12, 0),         -- hourly_rate × hours
  approved_amount NUMERIC(12, 0),           -- 운영자가 승인한 최종 금액
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | paid | rejected
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES operators(id) ON DELETE SET NULL,
  paid_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instructor_fees_session_instructor_idx ON instructor_fees(session_instructor_id);
CREATE INDEX IF NOT EXISTS instructor_fees_status_idx ON instructor_fees(status);

CREATE TRIGGER instructor_fees_set_updated_at
  BEFORE UPDATE ON instructor_fees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 3) 설문 (만족도)
-- =====================================================
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,  -- 세션별 설문일 때
  title TEXT NOT NULL,
  type TEXT NOT NULL,                       -- 'satisfaction' | 'usage'
  scope TEXT,                               -- 'cohort_end' | 'session' | 'mid' | 'final'
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS surveys_cohort_idx ON surveys(cohort_id);

CREATE TRIGGER surveys_set_updated_at
  BEFORE UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_no INTEGER NOT NULL,
  type TEXT NOT NULL,                       -- 'likert5' | 'text' | 'choice'
  text TEXT NOT NULL,
  options JSONB,                            -- 객관식 보기 (choice일 때)
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT survey_questions_survey_no_key UNIQUE (survey_id, question_no)
);

CREATE INDEX IF NOT EXISTS survey_questions_survey_idx ON survey_questions(survey_id);

CREATE TRIGGER survey_questions_set_updated_at
  BEFORE UPDATE ON survey_questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,               -- 1회용 응답 URL 토큰
  responses JSONB,                          -- {questionId: value, ...}
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT survey_responses_survey_student_key UNIQUE (survey_id, student_id)
);

CREATE INDEX IF NOT EXISTS survey_responses_survey_idx ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS survey_responses_student_idx ON survey_responses(student_id);

CREATE TRIGGER survey_responses_set_updated_at
  BEFORE UPDATE ON survey_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 4) 진단 (사전·사후)
-- =====================================================
CREATE TABLE IF NOT EXISTS diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,                       -- 'pre' | 'post' | 'follow_up'
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagnoses_cohort_idx ON diagnoses(cohort_id);

CREATE TRIGGER diagnoses_set_updated_at
  BEFORE UPDATE ON diagnoses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS diagnosis_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id UUID NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
  question_no INTEGER NOT NULL,
  type TEXT NOT NULL,                       -- 'likert5' | 'text' | 'choice'
  text TEXT NOT NULL,
  options JSONB,
  weight NUMERIC(5, 2) DEFAULT 1.0,         -- 점수 계산 가중치
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT diagnosis_questions_diagnosis_no_key UNIQUE (diagnosis_id, question_no)
);

CREATE INDEX IF NOT EXISTS diagnosis_questions_diagnosis_idx ON diagnosis_questions(diagnosis_id);

CREATE TRIGGER diagnosis_questions_set_updated_at
  BEFORE UPDATE ON diagnosis_questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS diagnosis_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id UUID NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  responses JSONB,
  total_score NUMERIC(8, 2),                -- 자동 계산된 합계 점수
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT diagnosis_responses_diagnosis_student_key UNIQUE (diagnosis_id, student_id)
);

CREATE INDEX IF NOT EXISTS diagnosis_responses_diagnosis_idx ON diagnosis_responses(diagnosis_id);
CREATE INDEX IF NOT EXISTS diagnosis_responses_student_idx ON diagnosis_responses(student_id);

CREATE TRIGGER diagnosis_responses_set_updated_at
  BEFORE UPDATE ON diagnosis_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 5) 평가위원·평가 (선발 평가)
-- =====================================================
CREATE TABLE IF NOT EXISTS evaluators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  anonymous_code TEXT,                      -- 익명 코드 (예: 'E-001')
  affiliation TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evaluators_cohort_code_key UNIQUE (cohort_id, anonymous_code)
);

CREATE INDEX IF NOT EXISTS evaluators_cohort_idx ON evaluators(cohort_id);

CREATE TRIGGER evaluators_set_updated_at
  BEFORE UPDATE ON evaluators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_id UUID NOT NULL REFERENCES evaluators(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  score NUMERIC(5, 2),                      -- 평가 점수 (정량)
  scores JSONB,                             -- 항목별 세부 점수 (예: {직급:5, 동기:4, ...})
  comments TEXT,                            -- 정성 의견
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evaluations_evaluator_application_key UNIQUE (evaluator_id, application_id)
);

CREATE INDEX IF NOT EXISTS evaluations_evaluator_idx ON evaluations(evaluator_id);
CREATE INDEX IF NOT EXISTS evaluations_application_idx ON evaluations(application_id);

CREATE TRIGGER evaluations_set_updated_at
  BEFORE UPDATE ON evaluations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 6) 결과보고서 (자동 초안)
-- =====================================================
CREATE TABLE IF NOT EXISTS cohort_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  type TEXT NOT NULL,                       -- 'session_summary' | 'cohort_final' | 'weekly'
  title TEXT,
  content JSONB,                            -- 자동 생성된 보고서 데이터 (출결·만족도·총평 등)
  status TEXT NOT NULL DEFAULT 'draft',     -- draft | reviewed | finalized
  file_path TEXT,                           -- 생성된 PDF/HWP 경로
  draft_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cohort_reports_cohort_idx ON cohort_reports(cohort_id);
CREATE INDEX IF NOT EXISTS cohort_reports_status_idx ON cohort_reports(status);

CREATE TRIGGER cohort_reports_set_updated_at
  BEFORE UPDATE ON cohort_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 7) 알림 발송 로그 (입과안내·리마인드·신청상태·결과통보 등)
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  recipient_type TEXT NOT NULL,             -- 'applicant' | 'student' | 'instructor' | 'evaluator'
  recipient_id UUID,                        -- type별 polymorphic (FK 없음)
  channel TEXT NOT NULL,                    -- 'email' | 'sms' | 'kakao'
  template_code TEXT,                       -- 'd_minus_7' | 'd_minus_3' | 'd_minus_1' | 'd_day' | 'application_status' | 'selection_result' | ...
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | sent | failed
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  external_message_id TEXT,                 -- 발송 업체에서 받은 ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_cohort_idx ON notifications(cohort_id);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications(status);

CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 8) 리스크·이슈
-- =====================================================
CREATE TABLE IF NOT EXISTS risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT,                            -- 7대 리스크 분류
  description TEXT,
  likelihood TEXT,                          -- 'low' | 'medium' | 'high'
  impact TEXT,                              -- 'low' | 'medium' | 'high'
  mitigation TEXT,
  status TEXT NOT NULL DEFAULT 'open',      -- open | mitigated | closed
  owner_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risks_status_idx ON risks(status);

CREATE TRIGGER risks_set_updated_at
  BEFORE UPDATE ON risks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',      -- open | in_progress | resolved
  priority TEXT,                            -- 'low' | 'medium' | 'high' | 'critical'
  related_cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  reported_at DATE,
  resolved_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issues_status_idx ON issues(status);
CREATE INDEX IF NOT EXISTS issues_cohort_idx ON issues(related_cohort_id);

CREATE TRIGGER issues_set_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 9) 기존 테이블 확장
-- =====================================================

-- cohorts: 모집 운영 컬럼
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS application_start_at DATE;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS application_end_at DATE;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS recruiting_slug TEXT;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS max_capacity INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS cohorts_recruiting_slug_unique_idx
  ON cohorts(recruiting_slug)
  WHERE recruiting_slug IS NOT NULL;


-- applications: 자가진단 + 선발 평가 데이터
ALTER TABLE applications ADD COLUMN IF NOT EXISTS self_diagnosis JSONB;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS recommended_track_id UUID
  REFERENCES tracks(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS motivation TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS related_work_years INTEGER;

CREATE INDEX IF NOT EXISTS applications_recommended_track_idx
  ON applications(recommended_track_id);


-- students: 확정된 트랙
ALTER TABLE students ADD COLUMN IF NOT EXISTS assigned_track_id UUID
  REFERENCES tracks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS students_assigned_track_idx
  ON students(assigned_track_id);
