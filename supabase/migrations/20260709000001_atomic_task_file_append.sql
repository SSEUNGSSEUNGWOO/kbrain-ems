-- 작업형 응답 파일 목록에 원자적으로 파일 append.
-- 서버 액션에서 read-modify-write 하면 concurrent 요청이 마지막 것이 앞선 것을 덮어써서
-- 파일이 유실됨. jsonb || 연산자로 UPDATE 문 안에서 한번에 append하면 원자적 (race 없음).
CREATE OR REPLACE FUNCTION append_task_file(
  p_session_id uuid,
  p_question_id uuid,
  p_new_file jsonb
) RETURNS jsonb AS $$
DECLARE
  result_files jsonb;
BEGIN
  -- upsert: 응답이 없으면 새로 만들고 files 배열에 파일 하나 넣음.
  -- 있으면 기존 files 배열에 append (jsonb || 연산자, 서버 시각을 submitted_at으로 갱신).
  INSERT INTO exam_responses (session_id, question_id, answer_value, submitted_at)
  VALUES (
    p_session_id,
    p_question_id,
    jsonb_build_object('files', jsonb_build_array(p_new_file)),
    now()
  )
  ON CONFLICT (session_id, question_id) DO UPDATE
  SET
    answer_value = jsonb_set(
      COALESCE(exam_responses.answer_value, '{}'::jsonb),
      '{files}',
      COALESCE(exam_responses.answer_value->'files', '[]'::jsonb) || p_new_file
    ),
    submitted_at = now()
  RETURNING answer_value->'files' INTO result_files;

  RETURN result_files;
END;
$$ LANGUAGE plpgsql;

-- 작업형 응답 파일 원자적 제거 (같은 원리)
CREATE OR REPLACE FUNCTION remove_task_file(
  p_session_id uuid,
  p_question_id uuid,
  p_path text
) RETURNS jsonb AS $$
DECLARE
  result_files jsonb;
BEGIN
  UPDATE exam_responses
  SET
    answer_value = jsonb_set(
      COALESCE(answer_value, '{}'::jsonb),
      '{files}',
      COALESCE(
        (SELECT jsonb_agg(elem)
         FROM jsonb_array_elements(COALESCE(answer_value->'files', '[]'::jsonb)) elem
         WHERE elem->>'path' <> p_path),
        '[]'::jsonb
      )
    ),
    submitted_at = now()
  WHERE session_id = p_session_id AND question_id = p_question_id
  RETURNING answer_value->'files' INTO result_files;

  RETURN COALESCE(result_files, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;
