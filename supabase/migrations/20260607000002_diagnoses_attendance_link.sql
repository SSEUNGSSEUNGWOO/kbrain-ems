-- 진단(사전·사후)을 출석 체크포인트와 연결하면 진단 제출 시 자동으로 그 체크포인트에
-- 체크인 + attendance_records 자동 반영.

ALTER TABLE diagnoses
  ADD COLUMN attendance_check_id UUID REFERENCES attendance_checks(id) ON DELETE SET NULL;

COMMENT ON COLUMN diagnoses.attendance_check_id IS
  '진단 제출이 자동 체크인할 출석 체크포인트. NULL이면 출석 연동 X.';

-- submit_diagnosis_response 확장 — 진단 채점·저장 후 attendance 자동 연동
DROP FUNCTION IF EXISTS public.submit_diagnosis_response(TEXT, JSONB, UUID);

CREATE FUNCTION public.submit_diagnosis_response(
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
  v_response       RECORD;
  v_score          NUMERIC := 0;
  v_max            NUMERIC := 0;
  v_correct        INT := 0;
  v_q              RECORD;
  v_ans            TEXT;
  v_correct_key    TEXT;
  v_keywords       TEXT[];
  v_kw             TEXT;
  v_match          BOOLEAN;
  v_attn_check_id  UUID;
  v_attn           RECORD;
  v_is_late        BOOLEAN;
  v_existing_status TEXT;
BEGIN
  SELECT r.id, r.diagnosis_id, r.student_id, r.submitted_at, r.total_score,
         d.opens_at, d.closes_at, d.title, d.type, d.attendance_check_id
    INTO v_response
    FROM public.diagnosis_responses r
    JOIN public.diagnoses d ON d.id = r.diagnosis_id
   WHERE r.token = p_token
   FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF v_response.submitted_at IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'already_submitted', true,
      'total_score', v_response.total_score, 'submitted_at', v_response.submitted_at);
  END IF;

  IF v_response.opens_at IS NOT NULL AND now() < v_response.opens_at THEN
    RETURN json_build_object('ok', false, 'error', 'not_yet_open');
  END IF;
  IF v_response.closes_at IS NOT NULL AND now() > v_response.closes_at THEN
    RETURN json_build_object('ok', false, 'error', 'closed');
  END IF;

  -- 채점
  FOR v_q IN
    SELECT question_no, type, options, weight FROM public.diagnosis_questions
     WHERE diagnosis_id = v_response.diagnosis_id ORDER BY question_no
  LOOP
    v_max := v_max + COALESCE(v_q.weight, 1);
    v_ans := p_answers ->> v_q.question_no::TEXT;
    IF v_ans IS NULL OR length(trim(v_ans)) = 0 THEN CONTINUE; END IF;
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
            v_match := TRUE; EXIT;
          END IF;
        END LOOP;
      END IF;
    END IF;

    IF v_match THEN
      v_score := v_score + COALESCE(v_q.weight, 1);
      v_correct := v_correct + 1;
    END IF;
  END LOOP;

  UPDATE public.diagnosis_responses
     SET responses = p_answers, total_score = v_score, submitted_at = now()
   WHERE id = v_response.id;

  -- 출석 자동 연동 (attendance_check_id + student_id 있을 때만)
  v_attn_check_id := v_response.attendance_check_id;
  IF v_attn_check_id IS NOT NULL AND v_response.student_id IS NOT NULL THEN
    SELECT id, session_id, attendance_role, criterion_at
      INTO v_attn
      FROM public.attendance_checks
     WHERE id = v_attn_check_id;
    IF FOUND THEN
      -- 체크포인트 기록 (중복 무시)
      INSERT INTO public.attendance_check_records (check_id, student_id, checked_at)
      VALUES (v_attn.id, v_response.student_id, now())
      ON CONFLICT (check_id, student_id) DO NOTHING;

      IF v_attn.attendance_role = 'arrival' THEN
        v_is_late := v_attn.criterion_at IS NOT NULL AND now() > v_attn.criterion_at;
        INSERT INTO public.attendance_records (session_id, student_id, status, arrival_time)
        VALUES (
          v_attn.session_id,
          v_response.student_id,
          CASE WHEN v_is_late THEN 'late' ELSE 'present' END,
          (to_char(now() AT TIME ZONE 'Asia/Seoul', 'HH24:MI'))::time
        )
        ON CONFLICT (session_id, student_id) DO UPDATE
        SET status = EXCLUDED.status, arrival_time = EXCLUDED.arrival_time;
      ELSIF v_attn.attendance_role = 'departure' THEN
        SELECT status INTO v_existing_status
          FROM public.attendance_records
         WHERE session_id = v_attn.session_id AND student_id = v_response.student_id;
        INSERT INTO public.attendance_records (session_id, student_id, status, departure_time)
        VALUES (
          v_attn.session_id,
          v_response.student_id,
          COALESCE(v_existing_status, 'present'),
          (to_char(now() AT TIME ZONE 'Asia/Seoul', 'HH24:MI'))::time
        )
        ON CONFLICT (session_id, student_id) DO UPDATE
        SET departure_time = EXCLUDED.departure_time;
      END IF;
    END IF;
  END IF;

  RETURN json_build_object('ok', true, 'already_submitted', false,
    'total_score', v_score, 'max_score', v_max,
    'correct_count', v_correct, 'submitted_at', now());
END $$;

GRANT EXECUTE ON FUNCTION public.submit_diagnosis_response(TEXT, JSONB, UUID) TO anon, authenticated;
