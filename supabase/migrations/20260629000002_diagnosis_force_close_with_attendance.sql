-- force_close_diagnosis_responses 가 출석 자동 연동도 트리거하도록 수정.
--
-- 정책 변경:
--   "응시 자체로 출석 인정" — 학생이 진단을 시작(started_at)했다면,
--   시간 초과로 미제출이어도 진단에 연결된 attendance_check 에 체크인되어야 한다.
--   (이전 버전은 '시간 안에 완료한 사람만 진단 출석 인정' 으로 출석 연동을 뺐었음.)
--
-- 출석 시각 처리:
--   - submit_diagnosis_response 는 now() 를 쓰지만, force_close 는 학생이 실제로
--     자리에 있었던 시점인 started_at 기준이 더 정확하다.
--     (며칠 뒤 운영자/cron 이 마감해도 도착 시각은 응시 시작 시각으로 박제)
--   - 지각 판단도 started_at vs criterion_at 으로 한다.
--
-- 이 파일은 두 가지를 한다:
--   1) force_close_diagnosis_responses 재정의 (출석 연동 포함)
--   2) 이미 마감된(과거 force_close 또는 submit) 진단 응답 중 attendance 연동이
--      누락된 행을 백필 ([비공개] 님 같은 케이스 정리)

DROP FUNCTION IF EXISTS public.force_close_diagnosis_responses(UUID[]);

CREATE FUNCTION public.force_close_diagnosis_responses(
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
          INSERT INTO public.attendance_records (session_id, student_id, status, arrival_time)
          VALUES (
            v_attn.session_id,
            v_target.student_id,
            CASE WHEN v_is_late THEN 'late' ELSE 'present' END,
            (to_char(v_target.started_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI'))::time
          )
          ON CONFLICT (session_id, student_id) DO UPDATE
          SET status = EXCLUDED.status, arrival_time = EXCLUDED.arrival_time;
        ELSIF v_attn.attendance_role = 'departure' THEN
          SELECT status INTO v_existing_status
            FROM public.attendance_records
           WHERE session_id = v_attn.session_id AND student_id = v_target.student_id;
          INSERT INTO public.attendance_records (session_id, student_id, status, departure_time)
          VALUES (
            v_attn.session_id,
            v_target.student_id,
            COALESCE(v_existing_status, 'present'),
            (to_char(v_close_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI'))::time
          )
          ON CONFLICT (session_id, student_id) DO UPDATE
          SET departure_time = EXCLUDED.departure_time;
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
  '진단 응답 강제 마감 (시간 초과·미제출). p_response_ids NULL 이면 시간 초과된 모든 응답 일괄 처리. attendance_check_id 가 연결돼 있으면 출석도 함께 자동 처리 — 도착 시각·지각 판단은 started_at 기준.';

------------------------------------------------------------------------
-- 백필: 이미 submitted_at 이 있는데 attendance 연동이 안 된 진단 응답들 처리.
-- (직전 force_close 가 출석을 안 걸어서 누락된 케이스 + 초기 submit 로직 도입 이전
--  레거시 응답 모두 한 번에 정리)
-- ON CONFLICT 로 idempotent.
------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_r               RECORD;
  v_attn            RECORD;
  v_at              TIMESTAMPTZ;
  v_is_late         BOOLEAN;
  v_existing_status TEXT;
  v_count           INT := 0;
BEGIN
  FOR v_r IN
    SELECT r.id, r.student_id, r.started_at, r.submitted_at,
           d.attendance_check_id
      FROM public.diagnosis_responses r
      JOIN public.diagnoses d ON d.id = r.diagnosis_id
     WHERE r.submitted_at IS NOT NULL
       AND r.student_id IS NOT NULL
       AND d.attendance_check_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.attendance_check_records acr
          WHERE acr.check_id = d.attendance_check_id
            AND acr.student_id = r.student_id
       )
  LOOP
    SELECT id, session_id, attendance_role, criterion_at
      INTO v_attn
      FROM public.attendance_checks
     WHERE id = v_r.attendance_check_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- 출석 시각: started_at(시작) 우선, 없으면 submitted_at
    v_at := COALESCE(v_r.started_at, v_r.submitted_at);

    INSERT INTO public.attendance_check_records (check_id, student_id, checked_at)
    VALUES (v_attn.id, v_r.student_id, v_at)
    ON CONFLICT (check_id, student_id) DO NOTHING;

    IF v_attn.attendance_role = 'arrival' THEN
      v_is_late := v_attn.criterion_at IS NOT NULL AND v_at > v_attn.criterion_at;
      INSERT INTO public.attendance_records (session_id, student_id, status, arrival_time)
      VALUES (
        v_attn.session_id,
        v_r.student_id,
        CASE WHEN v_is_late THEN 'late' ELSE 'present' END,
        (to_char(v_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI'))::time
      )
      ON CONFLICT (session_id, student_id) DO UPDATE
      SET status = EXCLUDED.status, arrival_time = EXCLUDED.arrival_time;
    ELSIF v_attn.attendance_role = 'departure' THEN
      SELECT status INTO v_existing_status
        FROM public.attendance_records
       WHERE session_id = v_attn.session_id AND student_id = v_r.student_id;
      INSERT INTO public.attendance_records (session_id, student_id, status, departure_time)
      VALUES (
        v_attn.session_id,
        v_r.student_id,
        COALESCE(v_existing_status, 'present'),
        (to_char(COALESCE(v_r.submitted_at, v_at) AT TIME ZONE 'Asia/Seoul', 'HH24:MI'))::time
      )
      ON CONFLICT (session_id, student_id) DO UPDATE
      SET departure_time = EXCLUDED.departure_time;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '백필 처리 건수: %', v_count;
END
$backfill$;
