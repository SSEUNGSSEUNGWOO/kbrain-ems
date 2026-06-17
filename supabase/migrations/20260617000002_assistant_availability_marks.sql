-- 운영자가 미리 표시하는 '이 회차에 가능한 보조강사' 마크.
-- row_key 는 보조강사 페이지의 가상 row.id 와 동일:
--   'session::{session_id}' | 'external::{event_id}' | 'selfstudy::{cohort_id}::{date}'
-- session/event/cohort 삭제 시 cascade 가 안 걸리므로 dangling row 가 생길 수 있음.
-- 비즈니스 영향 없음 (조회만), 필요 시 별도 cleanup.
create table if not exists assistant_availability_marks (
  row_key text not null,
  instructor_id uuid not null references instructors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (row_key, instructor_id)
);

create index if not exists idx_assistant_availability_marks_row_key
  on assistant_availability_marks(row_key);

comment on table assistant_availability_marks is
  '운영자가 회차/외부일정/셀프스터디에 미리 표시한 가용 보조강사. 배정과는 별개의 사전 메모.';
