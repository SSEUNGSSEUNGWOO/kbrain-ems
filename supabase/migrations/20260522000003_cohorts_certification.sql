-- 인증평가 기간. cohort 일정 정보에 보관하고 캘린더에서 별도 종류(indigo)로 표시.
alter table public.cohorts
  add column if not exists certification_start_at date,
  add column if not exists certification_end_at date;
