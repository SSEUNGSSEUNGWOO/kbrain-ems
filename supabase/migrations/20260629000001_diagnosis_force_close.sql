-- 진단 응답 강제 마감 RPC.
--
-- 학생이 진단을 시작(started_at)하고 제한 시간이 지나도 미제출인 경우,
-- 클라이언트 자동 제출이 작동하려면 학생이 탭을 열어두고 있어야 한다.
-- 탭을 닫거나 네트워크가 끊기면 영원히 submitted_at NULL 인 채로 남는다.
--
-- 이 RPC 는:
--   (1) 운영자 UI 에서 명시 id 들을 강제 마감 (p_response_ids 지정)
--   (2) Vercel Cron 에서 시간 초과된 모든 응답을 일괄 마감 (p_response_ids NULL)
-- 두 경우 모두 사용.
--
-- 마감 동작:
--   - submitted_at := COALESCE(started_at + duration, now())  (실제 만료 시각으로 박제)
--   - total_score  := 현재까지 responses 컬럼에 저장된 답안 기준 채점
--                     (자동 제출 로직은 제출 시점에만 RPC 호출 → 평소엔 NULL → 0점)
--   - responses    := 그대로 (NULL 이면 NULL)
--   - 출석 자동 연동(attendance_check_id)은 트리거하지 않는다.
--     원칙: 시간 안에 완료한 사람만 진단 출석 인정. 시간 초과는 별도 판단.
--
-- 처리 대상 조건 (cron 모드):
--   started_at IS NOT NULL
--   AND submitted_at IS NULL
--   AND now() >= started_at + (duration_minutes ||' minutes')::interval
--
-- 명시 id 모드에서도 위 조건을 만족하지 않는 id 는 스킵 (이미 제출됐거나 시작 안 한 경우).

CREATE OR REPLACE FUNCTION public.force_close_diagnosis_responses(
  p_response_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target          RECORD;
  v_score           NUMERIC;
  v_q               RECORD;
  v_ans             TEXT;
  v_correct_key     TEXT;
  v_keywords        TEXT[];
  v_kw              TEXT;
  v_match           BOOLEAN;
  v_close_at        TIMESTAMPTZ;
  v_closed_count    INT := 0;
  v_skipped_count   INT := 0;
BEGIN
  FOR v_target IN
    SELECT r.id, r.diagnosis_id, r.started_at, r.submitted_at,
           r.responses, d.duration_minutes
      FROM public.diagnosis_responses r
      JOIN public.diagnoses d ON d.id = r.diagnosis_id
     WHERE (p_response_ids IS NULL OR r.id = ANY(p_response_ids))
       AND r.started_at IS NOT NULL
       AND r.submitted_at IS NULL
       AND now() >= r.started_at + (d.duration_minutes || ' minutes')::interval
     FOR UPDATE OF r
  LOOP
    v_score    := 0;
    v_close_at := v_target.started_at + (v_target.duration_minutes || ' minutes')::interval;

    -- 채점 (responses 가 NULL 이거나 비어있으면 0점)
    IF v_target.responses IS NOT NULL AND jsonb_typeof(v_target.responses) = 'object' THEN
      FOR v_q IN
        SELECT question_no, type, options, weight
          FROM public.diagnosis_questions
         WHERE diagnosis_id = v_target.diagnosis_id
         ORDER BY question_no
      LOOP
        v_ans := v_target.responses ->> v_q.question_no::TEXT;
        IF v_ans IS NULL OR length(trim(v_ans)) = 0 THEN
          CONTINUE;
        END IF;
        v_match := FALSE;

        IF v_q.type IN ('multiple_choice', 'ox') THEN
          v_correct_key := v_q.options ->> 'correct';
          IF v_correct_key IS NOT NULL AND trim(v_ans) = v_correct_key THEN
            v_match := TRUE;
          END IF;
        ELSIF v_q.type = 'short_text' THEN
          SELECT array_agg(value::text) INTO v_keywords
            FROM jsonb_array_elements_text(v_q.options -> 'correct_keywords') AS value;
          IF v_keywords IS NOT NULL THEN
            FOREACH v_kw IN ARRAY v_keywords LOOP
              IF v_kw IS NOT NULL AND length(trim(v_kw)) > 0
                 AND lower(trim(v_ans)) LIKE '%' || lower(trim(v_kw)) || '%' THEN
                v_match := TRUE;
                EXIT;
              END IF;
            END LOOP;
          END IF;
        END IF;

        IF v_match THEN
          v_score := v_score + COALESCE(v_q.weight, 1);
        END IF;
      END LOOP;
    END IF;

    UPDATE public.diagnosis_responses
       SET submitted_at = v_close_at,
           total_score  = v_score
     WHERE id = v_target.id;

    v_closed_count := v_closed_count + 1;
  END LOOP;

  -- 명시 id 모드에서 조건 불충족으로 처리 안 된 행 수
  IF p_response_ids IS NOT NULL THEN
    v_skipped_count := array_length(p_response_ids, 1) - v_closed_count;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'closed', v_closed_count,
    'skipped', GREATEST(0, v_skipped_count)
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.force_close_diagnosis_responses(UUID[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.force_close_diagnosis_responses IS
  '진단 응답 강제 마감. p_response_ids NULL 이면 시간 초과된 모든 응답 일괄 처리(cron 용). 명시되면 해당 id 중 시간 초과·미제출 행만 처리. 출석 자동 연동 트리거 안 함.';
