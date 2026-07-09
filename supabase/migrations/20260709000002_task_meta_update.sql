-- 작업형 응답에서 notes·url 필드만 원자적으로 update.
-- 기존 saveAnswer는 read → merge → upsert 방식이라 파일 업로드와 race 발생 시
-- 방금 append된 files 필드를 stale prevFiles로 덮어써버림.
-- jsonb_set으로 파티셔닝된 필드만 건드리면 files·admin_rubric_scores 그대로 유지.
CREATE OR REPLACE FUNCTION update_task_meta(
  p_session_id uuid,
  p_question_id uuid,
  p_notes text,
  p_url text
) RETURNS void AS $$
BEGIN
  INSERT INTO exam_responses (session_id, question_id, answer_value, submitted_at)
  VALUES (
    p_session_id,
    p_question_id,
    jsonb_build_object(
      'notes', COALESCE(p_notes, ''),
      'url', COALESCE(p_url, '')
    ),
    now()
  )
  ON CONFLICT (session_id, question_id) DO UPDATE
  SET
    answer_value = jsonb_set(
      jsonb_set(
        COALESCE(exam_responses.answer_value, '{}'::jsonb),
        '{notes}',
        to_jsonb(COALESCE(p_notes, ''))
      ),
      '{url}',
      to_jsonb(COALESCE(p_url, ''))
    ),
    submitted_at = now();
END;
$$ LANGUAGE plpgsql;
