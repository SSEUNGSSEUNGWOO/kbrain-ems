-- 보조강사 캘린더 전용 외부 일정 (cohort 와 무관, 외부 출장·기관 일정 등).
-- 매일 1 row (sessions 정책과 동일).
create table if not exists assistant_external_events (
  id uuid primary key default gen_random_uuid(),
  on_date date not null,
  title text not null,
  organization text,
  required_count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assistant_external_events_on_date
  on assistant_external_events(on_date);

-- 외부 일정 보조강사 배정 (event × instructor)
create table if not exists assistant_external_assignments (
  event_id uuid not null references assistant_external_events(id) on delete cascade,
  instructor_id uuid not null references instructors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, instructor_id)
);

-- 셀프스터디 일자별 보조강사 배정 (cohort 의 self_study 기간 안에서 매일 토글)
create table if not exists cohort_self_study_assignments (
  cohort_id uuid not null references cohorts(id) on delete cascade,
  on_date date not null,
  instructor_id uuid not null references instructors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cohort_id, on_date, instructor_id)
);

create index if not exists idx_cohort_self_study_assignments_date
  on cohort_self_study_assignments(on_date);

-- 운영자 수동 토글: 이 회차는 보조강사 배정 대상이 아님.
-- OT 자동 감지 외에 추가로 운영자가 판단하는 케이스용.
alter table sessions
  add column if not exists assistant_not_required boolean not null default false;

comment on column sessions.assistant_not_required is
  '운영자가 수동으로 표시한 보조강사 배정 불필요 플래그. OT 같이 자동 감지되는 케이스 외 보조강사 필요 없는 회차에 사용.';
