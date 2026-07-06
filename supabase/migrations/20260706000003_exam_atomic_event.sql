-- 브라우저 이벤트 append를 원자적으로 처리.
-- 기존: JS에서 조회 → push → update = race condition (동시 이탈 시 이벤트 손실)
-- 개선: PostgreSQL의 jsonb || 연산자로 단일 UPDATE 문 (원자)
CREATE OR REPLACE FUNCTION public.append_exam_browser_event(
  sess_id uuid,
  event_data jsonb
) RETURNS void AS $$
  UPDATE public.exam_sessions
  SET browser_events = COALESCE(browser_events, '[]'::jsonb) || event_data
  WHERE id = sess_id;
$$ LANGUAGE sql;

COMMENT ON FUNCTION public.append_exam_browser_event IS
  'browser_events jsonb 배열에 이벤트 하나를 원자적으로 append. race condition 없음.';
