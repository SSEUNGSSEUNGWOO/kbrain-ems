-- force_close_diagnosis_responses 의 출석 자동 연동이 운영자 수기 기록을 덮어쓰지 않도록 수정.
--
-- 문제:
--   기존 arrival 연동은 ON CONFLICT DO UPDATE SET status = EXCLUDED.status 로
--   운영자가 이미 기록한 status(결석·공결·조퇴 등)를 present/late 로 뒤집었다.
--   자정 cron·운영자 강제마감이 낮에 저장한 출결을 되돌리는 "간헐 저장 실패"의 원인.
--
-- 정책 (QR 체크인 서버 액션과 동일):
--   - 기록이 없으면 신규 insert (present/late + 시각)
--   - 기록이 있으면 status 유지, arrival_time/departure_time 은 비어 있을 때만 채움

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
  v_attn            RECORD;
  v_is_late         BOOLEAN;
  v_existing_status TEXT;
  v_closed_count    INT := 0;
  v_skipped_count   INT := 0;
BEGIN
  FOR v_target IN
    SELECT r.id, r.diagnosis_id, r.student_id, r.started_at, r.submitted_at,
           r.responses, d.duration_minutes, d.attendance_check_id
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

    -- 출석 자동 연동 (attendance_check_id + student_id 있을 때만)
    IF v_target.attendance_check_id IS NOT NULL AND v_target.student_id IS NOT NULL THEN
      SELECT id, session_id, attendance_role, criterion_at
        INTO v_attn
        FROM public.attendance_checks
       WHERE id = v_target.attendance_check_id;
      IF FOUND THEN
        INSERT INTO public.attendance_check_records (check_id, student_id, checked_at)
        VALUES (v_attn.id, v_target.student_id, v_target.started_at)
        ON CONFLICT (check_id, student_id) DO NOTHING;

        IF v_attn.attendance_role = 'arrival' THEN
          v_is_late := v_attn.criterion_at IS NOT NULL AND v_target.started_at > v_attn.criterion_at;
          -- 기존 기록의 status 는 유지 ('none' 일 때만 교체), arrival_time 은 비어 있을 때만 채움
          INSERT INTO public.attendance_records (session_id, student_id, status, arrival_time)
          VALUES (
            v_attn.session_id,
            v_target.student_id,
            CASE WHEN v_is_late THEN 'late' ELSE 'present' END,
            (to_char(v_target.started_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI'))::time
          )
          ON CONFLICT (session_id, student_id) DO UPDATE
          SET status = CASE
                         WHEN attendance_records.status = 'none' THEN EXCLUDED.status
                         ELSE attendance_records.status
                       END,
              arrival_time = COALESCE(attendance_records.arrival_time, EXCLUDED.arrival_time);
        ELSIF v_attn.attendance_role = 'departure' THEN
          SELECT status INTO v_existing_status
            FROM public.attendance_records
           WHERE session_id = v_attn.session_id AND student_id = v_target.student_id;
          -- departure_time 도 비어 있을 때만 채움 (운영자 조퇴 시각 보존)
          INSERT INTO public.attendance_records (session_id, student_id, status, departure_time)
          VALUES (
            v_attn.session_id,
            v_target.student_id,
            COALESCE(v_existing_status, 'present'),
            (to_char(v_close_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI'))::time
          )
          ON CONFLICT (session_id, student_id) DO UPDATE
          SET departure_time = COALESCE(attendance_records.departure_time, EXCLUDED.departure_time);
        END IF;
      END IF;
    END IF;

    v_closed_count := v_closed_count + 1;
  END LOOP;

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
  '진단 응답 강제 마감 (시간 초과·미제출). p_response_ids NULL 이면 시간 초과된 모든 응답 일괄 처리. 출석 연동 시 기존 기록의 status·시각은 덮지 않는다 (없을 때만 기록).';
