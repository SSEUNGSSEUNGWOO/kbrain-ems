-- cohorts.orientation_date — 교육안내(OT 영상) 발송일
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS orientation_date DATE;
