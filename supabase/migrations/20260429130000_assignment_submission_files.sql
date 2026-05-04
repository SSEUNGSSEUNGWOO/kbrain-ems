-- =====================================================
-- 교육생별 과제 제출 첨부파일
-- =====================================================

alter table public.assignment_submissions
  add column file_path text,
  add column file_name text,
  add column file_size bigint,
  add column file_type text;

comment on column public.assignment_submissions.file_path is 'Supabase Storage 제출 파일 경로';
comment on column public.assignment_submissions.file_name is '원본 제출 파일명';
comment on column public.assignment_submissions.file_size is '제출 파일 크기(bytes)';
comment on column public.assignment_submissions.file_type is '제출 파일 MIME 타입';

insert into storage.buckets (id, name, public)
values ('assignment-submissions', 'assignment-submissions', false)
on conflict (id) do nothing;

create policy assignment_submission_files_dev_select
  on storage.objects for select
  using (bucket_id = 'assignment-submissions');

create policy assignment_submission_files_dev_insert
  on storage.objects for insert
  with check (bucket_id = 'assignment-submissions');

create policy assignment_submission_files_dev_update
  on storage.objects for update
  using (bucket_id = 'assignment-submissions')
  with check (bucket_id = 'assignment-submissions');

create policy assignment_submission_files_dev_delete
  on storage.objects for delete
  using (bucket_id = 'assignment-submissions');
