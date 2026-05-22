-- 셀프스터디 기간 (교육 중간/종료 후 자가학습 — 사전온라인과 시점 분리).
alter table public.cohorts
  add column if not exists self_study_start_at date,
  add column if not exists self_study_end_at date;
