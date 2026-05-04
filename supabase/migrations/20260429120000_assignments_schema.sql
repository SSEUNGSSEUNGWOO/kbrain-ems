-- =====================================================
-- 과제 스키마: assignments, assignment_submissions
-- =====================================================

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assignments is '기수별 과제 목록';

create index assignments_cohort_idx on public.assignments (cohort_id);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'not_submitted'
    check (status in ('not_submitted', 'submitted', 'late')),
  submitted_at date,
  score numeric(5,1),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

comment on table public.assignment_submissions is '학생별 과제 제출 현황';

create index submissions_assignment_idx on public.assignment_submissions (assignment_id);
create index submissions_student_idx on public.assignment_submissions (student_id);

create trigger assignments_set_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();

create trigger assignment_submissions_set_updated_at
  before update on public.assignment_submissions
  for each row execute function public.set_updated_at();

alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;

create policy assignments_dev_open_all
  on public.assignments for all using (true) with check (true);

create policy assignment_submissions_dev_open_all
  on public.assignment_submissions for all using (true) with check (true);
