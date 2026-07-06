-- 문항별 시간 제한 (순차 CBT). 객관식·단답만 지원, task_based는 UI에서 무시.
ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS time_limit_seconds int;

COMMENT ON COLUMN public.exam_questions.time_limit_seconds IS
  '문항별 시간 제한(초). null=무제한. task_based는 UI에서 무시.';

-- 응답 진입 시각 — 문항별 타이머 서버 검증(부정 방지)에 사용.
ALTER TABLE public.exam_responses
  ADD COLUMN IF NOT EXISTS visited_at timestamptz;

COMMENT ON COLUMN public.exam_responses.visited_at IS
  '응시자가 이 문항을 처음 진입한 시각. 문항별 타이머 서버 검증에 사용.';

-- 현재 진행 문항 인덱스 — 이전 이동 금지 순차 CBT용.
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS current_order_no int;

COMMENT ON COLUMN public.exam_sessions.current_order_no IS
  '현재 진행 중인 문항의 order_no. 순차 CBT — 뒤로 이동 금지. 이 값 이전 문항은 잠금.';
