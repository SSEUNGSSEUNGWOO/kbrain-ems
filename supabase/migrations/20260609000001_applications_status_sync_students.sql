-- applications.status 변경 시 students 자동 동기화 트리거.
--
-- 배경: 자동선발 RPC, 학생 페이지 promote/unpromote 함수, 신청·응답 표의 status 토글이
-- 각각 다르게 students 를 갱신해 일관성이 깨졌다. 신청·응답 표의 토글은 students 를
-- 손대지 않아 출결만 동적 필터로 가렸을 뿐, 과제·설문·진단 명단엔 그대로 남는 문제.
--
-- 해결: applications.status 가 selected 가 되면 students UPSERT, 그 반대면 그 cohort
-- 의 students 행 삭제. AFTER trigger 라 RPC/server action 모두에서 자동 동작.
-- 기존 RPC 의 promote/demote 로직과 idempotent (UPSERT + 멱등 DELETE) 하게 공존.

CREATE OR REPLACE FUNCTION public.sync_students_on_application_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1) selected 진입 (INSERT 시 selected, 또는 다른 상태 → selected)
  IF NEW.status = 'selected'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'selected')
  THEN
    INSERT INTO public.students (
      applicant_id, cohort_id, name, organization_id, department,
      job_title, job_role, birth_date, email, phone, notes
    )
    SELECT a.id, NEW.cohort_id, a.name, a.organization_id, a.department,
           a.job_title, a.job_role, a.birth_date, a.email, a.phone, a.notes
      FROM public.applicants a
     WHERE a.id = NEW.applicant_id
    ON CONFLICT (applicant_id, cohort_id) DO UPDATE
       SET name            = EXCLUDED.name,
           organization_id = EXCLUDED.organization_id,
           department      = EXCLUDED.department,
           job_title       = EXCLUDED.job_title,
           job_role        = EXCLUDED.job_role,
           birth_date      = EXCLUDED.birth_date,
           email           = EXCLUDED.email,
           phone           = EXCLUDED.phone,
           notes           = EXCLUDED.notes;
  END IF;

  -- 2) selected 이탈 (selected → 다른 상태)
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'selected'
     AND NEW.status IS DISTINCT FROM 'selected'
  THEN
    DELETE FROM public.students
     WHERE cohort_id    = NEW.cohort_id
       AND applicant_id = NEW.applicant_id;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_sync_students_on_app_status ON public.applications;

CREATE TRIGGER trg_sync_students_on_app_status
  AFTER INSERT OR UPDATE OF status ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_students_on_application_status();

COMMENT ON FUNCTION public.sync_students_on_application_status IS
  'applications.status 변경 시 students per-cohort 행 자동 sync. selected 진입=UPSERT, 이탈=DELETE.';
