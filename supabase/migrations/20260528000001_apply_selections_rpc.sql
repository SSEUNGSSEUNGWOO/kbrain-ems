-- 선발 확정/탈락을 한 트랜잭션으로 처리하는 RPC.
-- 함수 본문은 단일 implicit 트랜잭션. 중간에 예외 발생 시 두 UPDATE 모두 ROLLBACK 되어
-- "선발은 됐는데 탈락은 안 된" 중간 상태가 남지 않는다.
--
-- 안전 장치:
--   - withdrawn 및 이미 결정된 status(selected/rejected)는 변경하지 않음
--   - p_selected_ids가 비어 있으면 빈 배열로 처리 (선발 0, 탈락도 0)
--   - 같은 cohort 안에서만 동작

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

  RETURN json_build_object(
    'selected_count', v_selected_count,
    'rejected_count', v_rejected_count
  );
END
$$;

COMMENT ON FUNCTION public.apply_selections IS
  '자동 선발 확정 — 선발(p_selected_ids → selected)과 미선택자 탈락(rejected)을 한 트랜잭션으로 처리. withdrawn·이미 결정된 status는 보호.';
