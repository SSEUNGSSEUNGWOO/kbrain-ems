-- 진단 응답 시작 시각.
-- "예, 시작" 클릭 시 NULL 인 경우에만 채움. 카운트다운 권위 기준이라
-- 디바이스/브라우저가 바뀌어도 동일한 elapsed 로 이어진다.
alter table diagnosis_responses
  add column if not exists started_at timestamptz;

comment on column diagnosis_responses.started_at is
  '학생이 진단 시작 버튼을 누른 시각. NULL=아직 시작 안 함. 한 번 채워지면 덮어쓰지 않음.';
