-- cohort와 무관한 캘린더 독립 이벤트.
-- 인증평가·사전접속테스트 등 별도 일정 표시용.
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  event_date date NOT NULL,
  event_time time,
  category text,
  capacity int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_events_date_idx ON public.calendar_events(event_date);
CREATE INDEX IF NOT EXISTS calendar_events_category_idx ON public.calendar_events(category) WHERE category IS NOT NULL;

COMMENT ON TABLE public.calendar_events IS
  'cohort와 무관한 독립 캘린더 이벤트. 인증평가·사전접속테스트·기타 일정.';
COMMENT ON COLUMN public.calendar_events.category IS
  '이벤트 유형: 인증평가 / 사전접속테스트 / 기타';
