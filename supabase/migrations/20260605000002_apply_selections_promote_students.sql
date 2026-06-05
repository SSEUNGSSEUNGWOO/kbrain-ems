-- 자동선발 RPC 확장: applications.status 갱신 + students 테이블 동기화.
-- 기존 RPC는 status만 바꾸고 students 행을 만들지 않아 인원관리 페이지에서 누락됐다.
-- 한 트랜잭션 안에서 promote/demote 까지 처리 → 중간 상태 불가.

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
  -- 1) 선발: applied/pending 중 선택된 사람만 selected 로
  UPDATE public.applications
     SET status      = 'selected',
         decided_at  = p_decided_at
   WHERE cohort_id   = p_cohort_id
     AND status IN ('applied', 'pending')
     AND id = ANY (v_ids);
  GET DIAGNOSTICS v_selected_count = ROW_COUNT;

  -- 2) 탈락: 옵션 ON일 때만, applied/pending 중 미선택자만 rejected 로
  IF p_reject_others THEN
    UPDATE public.applications
       SET status      = 'rejected',
           decided_at  = p_decided_at
     WHERE cohort_id   = p_cohort_id
       AND status IN ('applied', 'pending')
       AND NOT (id = ANY (v_ids));
    GET DIAGNOSTICS v_rejected_count = ROW_COUNT;
  END IF;

  -- 3) Promote: 이 기수의 모든 selected 신청자를 students 에 UPSERT
  --    (idempotent — 이미 있으면 cohort_id + 정보만 갱신)
  INSERT INTO public.students (
    id, cohort_id, name, organization_id, department,
    job_title, job_role, birth_date, email, phone, notes
  )
  SELECT a.id, p_cohort_id, a.name, a.organization_id, a.department,
         a.job_title, a.job_role, a.birth_date, a.email, a.phone, a.notes
    FROM public.applications app
    JOIN public.applicants a ON a.id = app.applicant_id
   WHERE app.cohort_id = p_cohort_id
     AND app.status = 'selected'
  ON CONFLICT (id) DO UPDATE
     SET cohort_id       = EXCLUDED.cohort_id,
         name            = EXCLUDED.name,
         organization_id = EXCLUDED.organization_id,
         department      = EXCLUDED.department,
         job_title       = EXCLUDED.job_title,
         job_role        = EXCLUDED.job_role,
         birth_date      = EXCLUDED.birth_date,
         email           = EXCLUDED.email,
         phone           = EXCLUDED.phone,
         notes           = EXCLUDED.notes;
  GET DIAGNOSTICS v_promoted_count = ROW_COUNT;

  -- 4) Demote: 이 기수의 students 중 더 이상 어떤 기수에도 selected 가 없는 사람 제거
  DELETE FROM public.students s
   WHERE s.cohort_id = p_cohort_id
     AND NOT EXISTS (
       SELECT 1 FROM public.applications app2
        WHERE app2.applicant_id = s.id
          AND app2.status = 'selected'
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
  '자동 선발 확정 — applications status 갱신(selected/rejected) + students 테이블 promote/demote 까지 한 트랜잭션. withdrawn·이미 결정된 status 는 보호.';
