-- 타 기수(자기주도형) 응시 결과를 원 과정으로 반영할 때 출처 표시.
-- null = 본 기수에서 응시. 값이 있으면 해당 기수 시험 결과를 복사해 온 것.
alter table public.certification_results
  add column if not exists source_cohort_id uuid references public.cohorts(id) on delete set null;

comment on column public.certification_results.source_cohort_id is
  '실제 응시가 일어난 기수 (원 과정 미수료자가 자기주도형에서 응시 → 원 과정으로 반영 시 기록). null = 본 기수 응시';
