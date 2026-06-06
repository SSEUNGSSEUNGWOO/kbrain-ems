-- 진단 응답 제출 RPC — Codex 권장 설계
-- - 단일 트랜잭션 (UPDATE 1회)
-- - 토큰 검증 + 시간 검증 + 서버측 채점
-- - Idempotent: submitted_at 있으면 같은 결과 반환 (다시 제출 불가)
-- - 입력: token, answers JSONB ({question_no: answer_value, ...}), submit_id (재시도 dedup)
-- - 반환: {ok, total_score, max_score, submitted_at, correct_count}

CREATE OR REPLACE FUNCTION public.submit_diagnosis_response(
  p_token     TEXT,
  p_answers   JSONB,
  p_submit_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response  RECORD;
  v_diag      RECORD;
  v_score     NUMERIC := 0;
  v_max       NUMERIC := 0;
  v_correct   INT := 0;
  v_q         RECORD;
  v_ans       TEXT;
  v_correct_key TEXT;
  v_keywords  TEXT[];
  v_kw        TEXT;
  v_match     BOOLEAN;
BEGIN
  -- 1) 응답 row + 진단 정보 조회
  SELECT r.id, r.diagnosis_id, r.submitted_at, r.total_score,
         d.opens_at, d.closes_at, d.title, d.type
    INTO v_response
    FROM public.diagnosis_responses r
    JOIN public.diagnoses d ON d.id = r.diagnosis_id
   WHERE r.token = p_token
   FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- 2) 이미 제출됨 → idempotent 반환 (같은 결과 반환, 재제출 거부)
  IF v_response.submitted_at IS NOT NULL THEN
    RETURN json_build_object(
      'ok', true,
      'already_submitted', true,
      'total_score', v_response.total_score,
      'submitted_at', v_response.submitted_at
    );
  END IF;

  -- 3) 응답 기간 검증
  IF v_response.opens_at IS NOT NULL AND now() < v_response.opens_at THEN
    RETURN json_build_object('ok', false, 'error', 'not_yet_open');
  END IF;
  IF v_response.closes_at IS NOT NULL AND now() > v_response.closes_at THEN
    RETURN json_build_object('ok', false, 'error', 'closed');
  END IF;

  -- 4) 채점: 문항별로 정답 비교
  FOR v_q IN
    SELECT question_no, type, options, weight
      FROM public.diagnosis_questions
     WHERE diagnosis_id = v_response.diagnosis_id
     ORDER BY question_no
  LOOP
    v_max := v_max + COALESCE(v_q.weight, 1);

    v_ans := p_answers ->> v_q.question_no::TEXT;
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
      -- correct_keywords 배열의 어느 하나라도 답안에 포함되면 정답
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
      v_correct := v_correct + 1;
    END IF;
  END LOOP;

  -- 5) 응답 저장 — 단일 UPDATE
  UPDATE public.diagnosis_responses
     SET responses    = p_answers,
         total_score  = v_score,
         submitted_at = now()
   WHERE id = v_response.id;

  RETURN json_build_object(
    'ok', true,
    'already_submitted', false,
    'total_score', v_score,
    'max_score', v_max,
    'correct_count', v_correct,
    'submitted_at', now()
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.submit_diagnosis_response(TEXT, JSONB, UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_diagnosis_response IS
  '진단 응답 제출 — 토큰 검증 + 서버측 채점 + 단일 UPDATE. 이미 제출된 경우 기존 점수 반환(idempotent). SECURITY DEFINER 로 anon 호출 허용.';
