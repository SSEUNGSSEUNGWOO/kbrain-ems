-- 날짜 × 보조강사 가용 마크.
-- 운영자가 '그 날 가능한 보조강사' 를 미리 표시. 모든 회차/외부일정/셀프스터디에
-- 동일 적용. 배정과는 별개의 사전 메모.
create table if not exists assistant_daily_availability (
  on_date date not null,
  instructor_id uuid not null references instructors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (on_date, instructor_id)
);

create index if not exists idx_assistant_daily_availability_date
  on assistant_daily_availability(on_date);

comment on table assistant_daily_availability is
  '날짜 × 보조강사 가용 마크. 그 날 가능한 보조강사를 운영자가 미리 표시. 모든 회차/외부일정/셀프스터디에 동일 적용.';
