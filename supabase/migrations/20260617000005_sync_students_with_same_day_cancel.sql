-- 'same_day_cancel'(당일취소) 학생도 students 행 유지. 이전 트리거는 selected 이탈
-- 시 무조건 student 행을 지웠는데, 당일취소는 출결판·과제·진단·만족도 명단에
-- 그대로 표시되어야 함.

create or replace function public.sync_students_on_application_status()
returns trigger
language plpgsql
as $$
begin
  -- student 유지 대상 (selected 또는 same_day_cancel) 으로 진입
  if new.status in ('selected', 'same_day_cancel')
     and (tg_op = 'INSERT' or old.status not in ('selected', 'same_day_cancel'))
  then
    insert into public.students (
      applicant_id, cohort_id, name, organization_id, department,
      job_title, job_role, birth_date, email, phone, notes
    )
    select a.id, new.cohort_id, a.name, a.organization_id, a.department,
           a.job_title, a.job_role, a.birth_date, a.email, a.phone, a.notes
      from public.applicants a
     where a.id = new.applicant_id
    on conflict (applicant_id, cohort_id) do update
       set name            = excluded.name,
           organization_id = excluded.organization_id,
           department      = excluded.department,
           job_title       = excluded.job_title,
           job_role        = excluded.job_role,
           birth_date      = excluded.birth_date,
           email           = excluded.email,
           phone           = excluded.phone,
           notes           = excluded.notes;
  end if;

  -- student 삭제 대상 (유지 set 에서 이탈)
  if tg_op = 'UPDATE'
     and old.status in ('selected', 'same_day_cancel')
     and new.status not in ('selected', 'same_day_cancel')
  then
    delete from public.students
     where cohort_id    = new.cohort_id
       and applicant_id = new.applicant_id;
  end if;

  return new;
end
$$;

-- 데이터 복구: 이미 same_day_cancel 인데 students 행 없는 케이스를 다시 채움.
insert into public.students (
  applicant_id, cohort_id, name, organization_id, department,
  job_title, job_role, birth_date, email, phone, notes
)
select a.id, app.cohort_id, a.name, a.organization_id, a.department,
       a.job_title, a.job_role, a.birth_date, a.email, a.phone, a.notes
  from public.applications app
  join public.applicants a on a.id = app.applicant_id
 where app.status = 'same_day_cancel'
   and not exists (
     select 1 from public.students s
      where s.cohort_id = app.cohort_id and s.applicant_id = app.applicant_id
   );
