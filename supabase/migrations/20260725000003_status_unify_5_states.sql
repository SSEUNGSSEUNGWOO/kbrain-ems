-- applications.status 를 5개 세트로 통일:
--   신청(applied) · 선발(selected) · 탈락(rejected) · 사전취소(pre_cancel) · 당일취소(same_day_cancel)
--
-- 기존 값 매핑:
--   shortlisted(서류합격), pending(심사중)         → applied
--   withdrew(철회), cancel_notice(취소통보), cancel_confirmed(취소확정) → pre_cancel
--
-- 트리거(sync_students_on_application_status) 는 이미
-- `('selected', 'same_day_cancel')` 만 students 로 유지하므로 별도 변경 불필요.
-- apply_selections RPC 만 `status IN ('applied', 'pending')` → `status = 'applied'` 로 정리.

DO $$
DECLARE
  v_to_applied int;
  v_to_pre_cancel int;
BEGIN
  UPDATE public.applications SET status = 'applied'
   WHERE status IN ('shortlisted', 'pending');
  GET DIAGNOSTICS v_to_applied = ROW_COUNT;

  UPDATE public.applications SET status = 'pre_cancel'
   WHERE status IN ('withdrew', 'cancel_notice', 'cancel_confirmed');
  GET DIAGNOSTICS v_to_pre_cancel = ROW_COUNT;

  RAISE NOTICE 'applications.status unified: % → applied, % → pre_cancel',
    v_to_applied, v_to_pre_cancel;
END $$;

-- apply_selections RPC 갱신 (pending 제거)
CREATE OR REPLACE FUNCTION public.apply_selections(
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
  UPDATE public.applications
     SET status      = 'selected',
         decided_at  = p_decided_at
   WHERE cohort_id   = p_cohort_id
     AND status      = 'applied'
     AND id = ANY (v_ids);
  GET DIAGNOSTICS v_selected_count = ROW_COUNT;

  IF p_reject_others THEN
    UPDATE public.applications
       SET status      = 'rejected',
           decided_at  = p_decided_at
     WHERE cohort_id   = p_cohort_id
       AND status      = 'applied'
       AND NOT (id = ANY (v_ids));
    GET DIAGNOSTICS v_rejected_count = ROW_COUNT;
  END IF;

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

  DELETE FROM public.students s
   WHERE s.cohort_id = p_cohort_id
     AND NOT EXISTS (
       SELECT 1 FROM public.applications app2
        WHERE app2.applicant_id = s.applicant_id
          AND app2.cohort_id    = p_cohort_id
          AND app2.status       IN ('selected', 'same_day_cancel')
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
  '자동 선발 확정 — applications.status(applied → selected/rejected) + students per-cohort UPSERT/DELETE. selected/same_day_cancel 만 students 유지.';
