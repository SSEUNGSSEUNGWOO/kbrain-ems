-- 진단별 응답 제한 시간 (분)
-- 기본 7분. 진단 응답 페이지 카운트다운에서 사용.
alter table diagnoses
  add column if not exists duration_minutes integer not null default 7;

-- AI 챔피언 블루(중급) 종합과정은 10분으로 운영. 자기주도형은 제외.
update diagnoses
set duration_minutes = 10
where cohort_id in (
  select id from cohorts
  where name like 'AI 챔피언 블루%회차'
    and name not like '%자기주도형%'
);
