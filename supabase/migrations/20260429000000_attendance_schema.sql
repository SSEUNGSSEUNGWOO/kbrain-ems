-- =====================================================
-- 출결 스키마: sessions, attendance_records
-- =====================================================

-- =====================================================
-- 1) Tables
-- =====================================================

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  session_date date not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sessions is '수업 회차 (날짜별 출결 단위)';

create index sessions_cohort_idx on public.sessions (cohort_id);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'present'
    check (status in ('present', 'absent', 'late', 'excused')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

comment on table public.attendance_records is '학생별 회차 출결 기록';

create index attendance_session_idx on public.attendance_records (session_id);
create index attendance_student_idx on public.attendance_records (student_id);

-- =====================================================
-- 2) updated_at 트리거
-- =====================================================

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- =====================================================
-- 3) RLS
-- =====================================================

alter table public.sessions enable row level security;
alter table public.attendance_records enable row level security;

-- 개발 단계 임시 정책 — Supabase Auth 도입 후 운영자 화이트리스트로 교체
create policy sessions_dev_open_all
  on public.sessions for all
  using (true) with check (true);

create policy attendance_records_dev_open_all
  on public.attendance_records for all
  using (true) with check (true);
