-- ON CONFLICT 추론 가능한 일반 unique constraint로 교체.
-- 부분 인덱스는 PostgreSQL의 ON CONFLICT inference 대상이 아님.
-- (course_code, certificate_no) 자체에 unique constraint를 두고,
-- NULL certificate_no는 PostgreSQL 기본 동작에 따라 distinct로 처리 (여러 row 허용).

DROP INDEX IF EXISTS public.lms_completions_course_cert_unique_idx;

ALTER TABLE public.lms_completions
  DROP CONSTRAINT IF EXISTS lms_completions_course_cert_unique;

ALTER TABLE public.lms_completions
  ADD CONSTRAINT lms_completions_course_cert_unique
  UNIQUE (course_code, certificate_no);
