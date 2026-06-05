-- students 를 per-cohort enrollment 모델로 변경.
-- 기존: students.id = applicants.id (1:1) → 한 사람은 한 cohort 학생만 가능
-- 변경: students.id 는 자체 UUID, students.applicant_id 가 applicants 참조 → 한 사람이 여러 cohort 학생 가능
--
-- 자식 테이블(attendance_records, assignment_submissions, survey_*, diagnosis_responses, notifications)은
-- students.id 를 그대로 참조하므로 값 보존 — FK 변경 불필요.

-- 1) applicant_id 컬럼 추가 + 기존 데이터 백필
ALTER TABLE students ADD COLUMN applicant_id UUID;
UPDATE students SET applicant_id = id;
ALTER TABLE students ALTER COLUMN applicant_id SET NOT NULL;

-- 2) applicant_id 에 새 FK (CASCADE) 추가
ALTER TABLE students
  ADD CONSTRAINT students_applicant_id_fkey
  FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE;

-- 3) (applicant_id, cohort_id) UNIQUE — 같은 사람이 같은 기수에 두 번 등록 불가
ALTER TABLE students
  ADD CONSTRAINT students_applicant_cohort_key
  UNIQUE (applicant_id, cohort_id);

-- 4) 기존 students.id → applicants.id FK 제거 (이제 id 는 독립적인 enrollment id)
ALTER TABLE students DROP CONSTRAINT students_id_fkey;

-- 5) students.id 기본값을 gen_random_uuid() 로 — 새 row 는 자동 UUID 생성
ALTER TABLE students ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 6) apply_selections RPC 수정 — applicant_id 기반 UPSERT
DROP FUNCTION IF EXISTS public.apply_selections(UUID, UUID[], BOOLEAN, DATE);

CREATE FUNCTION public.apply_selections(
  p_cohort_id     UUID,
  p_selected_ids  UUID[],
  p_reject_others BOOLEAN,
  p_decided_at    DATE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_selected_count INT := 0;
  v_rejected_count INT := 0;
  v_promoted_count INT := 0;
  v_demoted_count  INT := 0;
  v_ids            UUID[] := COALESCE(p_selected_ids, ARRAY[]::UUID[]);
BEGIN
  -- 1) 선발: applied/pending 중 선택된 사람만 selected
  UPDATE public.applications
     SET status      = 'selected',
         decided_at  = p_decided_at
   WHERE cohort_id   = p_cohort_id
     AND status IN ('applied', 'pending')
     AND id = ANY (v_ids);
  GET DIAGNOSTICS v_selected_count = ROW_COUNT;

  -- 2) 탈락: reject_others ON 일 때만
  IF p_reject_others THEN
    UPDATE public.applications
       SET status      = 'rejected',
           decided_at  = p_decided_at
     WHERE cohort_id   = p_cohort_id
       AND status IN ('applied', 'pending')
       AND NOT (id = ANY (v_ids));
    GET DIAGNOSTICS v_rejected_count = ROW_COUNT;
  END IF;

  -- 3) Promote: 이 기수의 selected 신청자를 students 에 UPSERT
  --    KEY = (applicant_id, cohort_id) — 같은 사람이 다른 기수에 student 인 것에 영향 없음
  INSERT INTO public.students (
    applicant_id, cohort_id, name, organization_id, department,
    job_title, job_role, birth_date, email, phone, notes
  )
  SELECT a.id, p_cohort_id, a.name, a.organization_id, a.department,
         a.job_title, a.job_role, a.birth_date, a.email, a.phone, a.notes
    FROM public.applications app
    JOIN public.applicants a ON a.id = app.applicant_id
   WHERE app.cohort_id = p_cohort_id
     AND app.status = 'selected'
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
  GET DIAGNOSTICS v_promoted_count = ROW_COUNT;

  -- 4) Demote: 이 기수의 students 중 해당 기수의 application 이 더 이상 selected 가 아닌 사람 제거
  DELETE FROM public.students s
   WHERE s.cohort_id = p_cohort_id
     AND NOT EXISTS (
       SELECT 1 FROM public.applications app2
        WHERE app2.applicant_id = s.applicant_id
          AND app2.cohort_id    = p_cohort_id
          AND app2.status       = 'selected'
     );
  GET DIAGNOSTICS v_demoted_count = ROW_COUNT;

  RETURN json_build_object(
    'selected_count', v_selected_count,
    'rejected_count', v_rejected_count,
    'promoted_count', v_promoted_count,
    'demoted_count',  v_demoted_count
  );
END
$$;

COMMENT ON FUNCTION public.apply_selections IS
  '자동 선발 확정 — applications status 갱신(selected/rejected) + students per-cohort UPSERT/제거. 같은 applicant 가 다른 기수 student 인 것에 영향 없음.';
