-- 지원자 마스터
CREATE TABLE IF NOT EXISTS applicants (
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

CREATE INDEX IF NOT EXISTS applicants_organization_idx
  ON applicants(organization_id);

CREATE TRIGGER applicants_set_updated_at
  BEFORE UPDATE ON applicants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 지원 이력 (지원자 × 기수)
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE RESTRICT,
  -- applied / shortlisted / selected / rejected / withdrew
  status TEXT NOT NULL DEFAULT 'applied',
  -- docs / interview / final  (rejected일 때 어디서 떨어졌는지)
  rejected_stage TEXT,
  applied_at DATE,
  decided_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT applications_applicant_cohort_key UNIQUE (applicant_id, cohort_id)
);

CREATE INDEX IF NOT EXISTS applications_applicant_idx
  ON applications(applicant_id);
CREATE INDEX IF NOT EXISTS applications_cohort_idx
  ON applications(cohort_id);

CREATE TRIGGER applications_set_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
