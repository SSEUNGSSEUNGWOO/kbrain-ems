-- applicants/students 에 personal_email 컬럼 추가
-- 기존 email 컬럼은 "공공이메일(work email)"로 의미 재정의
-- 도메인 기반 backfill: 사설 도메인이면 personal_email 로 옮기고 email 은 NULL

ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS personal_email text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS personal_email text;

-- 사설(개인) 도메인 화이트리스트
-- gov/go.kr/or.kr/ac.kr/공공기관 도메인 등은 모두 work_email 로 잔류
WITH private_domains AS (
  SELECT unnest(ARRAY[
    'naver.com','gmail.com','daum.net','hanmail.net','kakao.com',
    'hotmail.com','outlook.com','yahoo.com','yahoo.co.kr','nate.com',
    'icloud.com','me.com','live.com','korea.com','dreamwiz.com',
    'paran.com','empas.com','hanmir.com','chol.com','hitel.net',
    'naver.net','hanafos.com'
  ]) AS domain
)
UPDATE public.applicants
SET personal_email = email,
    email = NULL
WHERE email IS NOT NULL
  AND personal_email IS NULL
  AND lower(split_part(email, '@', 2)) IN (SELECT domain FROM private_domains);

WITH private_domains AS (
  SELECT unnest(ARRAY[
    'naver.com','gmail.com','daum.net','hanmail.net','kakao.com',
    'hotmail.com','outlook.com','yahoo.com','yahoo.co.kr','nate.com',
    'icloud.com','me.com','live.com','korea.com','dreamwiz.com',
    'paran.com','empas.com','hanmir.com','chol.com','hitel.net',
    'naver.net','hanafos.com'
  ]) AS domain
)
UPDATE public.students
SET personal_email = email,
    email = NULL
WHERE email IS NOT NULL
  AND personal_email IS NULL
  AND lower(split_part(email, '@', 2)) IN (SELECT domain FROM private_domains);
