-- 사전 온라인 학습 기간 (OT 이전 자가학습 구간).
-- sessions(수업)와 별도로 cohort 일정 정보에 보관하기 위함 — 캘린더에서도 별도 색·종류로 표시.
alter table public.cohorts
  add column if not exists pre_online_start_at date,
  add column if not exists pre_online_end_at date;
