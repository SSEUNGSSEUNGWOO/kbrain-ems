-- =====================================================
-- 2026년 K-Brain AI 챔피언 마스터 일정 적용 (HWP "260519_1200_교육 일정 세부표")
--   A. UPDATE — 빈 일정 채움 (그린 26-2~6기, 블루 26-3~5기)
--   B. UPDATE — 기존 일정 보정 (블루 26-1·2기 인증평가, 바이브 1회차, 강사양성 1·2회차)
--   C. DELETE — HWP에 없는 잉여 cohort (테크 브리핑 5, 고위공무원특강 4)
-- 컬럼 매핑: OT → orientation_date / started_at,
--           사전온라인 → pre_online_*, 셀프학습 → self_study_*,
--           인증평가 → certification_* / ended_at.
-- 집중교육(본교육) 기간은 cohort에 컬럼이 없으므로 sessions 동기화는 별도 작업.
-- =====================================================

begin;

-- =========================================================================
-- A. UPDATE — 빈 일정 채움
-- =========================================================================

-- 그린 26-2기 (100, 과제형, 이중균)
update public.cohorts set
  started_at = '2026-07-07',
  ended_at = '2026-07-28',
  orientation_date = '2026-07-07',
  pre_online_start_at = '2026-07-08',
  pre_online_end_at = '2026-07-10',
  self_study_start_at = '2026-07-16',
  self_study_end_at = '2026-07-20',
  certification_start_at = '2026-07-28',
  certification_end_at = '2026-07-28'
where id = '175c280a-d24b-418a-867e-0ca322ef97f9';

-- 그린 26-3기 (100, 과제형, 김태유)
update public.cohorts set
  started_at = '2026-07-21',
  ended_at = '2026-08-25',
  orientation_date = '2026-07-21',
  pre_online_start_at = '2026-07-22',
  pre_online_end_at = '2026-07-24',
  self_study_start_at = '2026-07-30',
  self_study_end_at = '2026-07-31',
  certification_start_at = '2026-08-25',
  certification_end_at = '2026-08-25'
where id = 'a58022fc-324a-44cb-b418-91f008e7f1a0';

-- 그린 26-4기 (80, 비대면, 이중균)
update public.cohorts set
  started_at = '2026-07-28',
  ended_at = '2026-08-25',
  orientation_date = '2026-07-28',
  pre_online_start_at = '2026-07-29',
  pre_online_end_at = '2026-07-31',
  self_study_start_at = '2026-08-06',
  self_study_end_at = '2026-08-07',
  certification_start_at = '2026-08-25',
  certification_end_at = '2026-08-25'
where id = '6ef1b2f3-3054-4933-87d9-7964842e2250';

-- 그린 26-5기 (100, 과제형, 현중균)
update public.cohorts set
  started_at = '2026-08-04',
  ended_at = '2026-08-25',
  orientation_date = '2026-08-04',
  pre_online_start_at = '2026-08-05',
  pre_online_end_at = '2026-08-07',
  self_study_start_at = '2026-08-13',
  self_study_end_at = '2026-08-14',
  certification_start_at = '2026-08-25',
  certification_end_at = '2026-08-25'
where id = '62dc634d-281b-4992-8a04-74872d408fb2';

-- 그린 26-6기 (100, 과제형, 김용재)
update public.cohorts set
  started_at = '2026-09-08',
  ended_at = '2026-09-29',
  orientation_date = '2026-09-08',
  pre_online_start_at = '2026-09-09',
  pre_online_end_at = '2026-09-11',
  self_study_start_at = '2026-09-17',
  self_study_end_at = '2026-09-18',
  certification_start_at = '2026-09-29',
  certification_end_at = '2026-09-29'
where id = '9769648d-86ab-4265-b5c3-cc8ef4563229';

-- 블루 26-3기 (80, 비대면, 현중균)
update public.cohorts set
  started_at = '2026-06-30',
  ended_at = '2026-07-29',
  orientation_date = '2026-06-30',
  pre_online_start_at = '2026-07-01',
  pre_online_end_at = '2026-07-03',
  self_study_start_at = '2026-07-09',
  self_study_end_at = '2026-07-13',
  certification_start_at = '2026-07-29',
  certification_end_at = '2026-07-29'
where id = '7b1c6e7d-853f-4866-a278-b30e2065dd22';

-- 블루 26-4기 (100, 과제형, 김태유)
update public.cohorts set
  started_at = '2026-07-13',
  ended_at = '2026-07-29',
  orientation_date = '2026-07-13',
  pre_online_start_at = '2026-07-14',
  pre_online_end_at = '2026-07-16',
  self_study_start_at = '2026-07-23',
  self_study_end_at = '2026-07-27',
  certification_start_at = '2026-07-29',
  certification_end_at = '2026-07-29'
where id = '385f6497-0b85-41d9-8668-bc0c8cf8f9b6';

-- 블루 26-5기 (100, 과제형, 김용재)
update public.cohorts set
  started_at = '2026-08-04',
  ended_at = '2026-08-26',
  orientation_date = '2026-08-04',
  pre_online_start_at = '2026-08-05',
  pre_online_end_at = '2026-08-07',
  self_study_start_at = '2026-08-13',
  self_study_end_at = '2026-08-18',
  certification_start_at = '2026-08-26',
  certification_end_at = '2026-08-26'
where id = 'f046ddf8-c458-4bf4-a71d-3230bc798e8a';

-- =========================================================================
-- B. UPDATE — 기존 일정 보정
-- =========================================================================

-- 블루 26-1기: 인증평가 06-30 → 07-01
update public.cohorts set
  ended_at = '2026-07-01',
  certification_start_at = '2026-07-01',
  certification_end_at = '2026-07-01'
where id = 'b5149035-b7d2-440e-9016-6c2997912b0e';

-- 블루 26-2기: 인증평가 06-30 → 07-01
update public.cohorts set
  ended_at = '2026-07-01',
  certification_start_at = '2026-07-01',
  certification_end_at = '2026-07-01'
where id = '06781a96-9229-42ec-b59c-89ce11378d3e';

-- 바이브 코딩 LLM 서비스 개발 1회차: 07-29~07-30 → 07-30~07-31
update public.cohorts set
  started_at = '2026-07-30',
  ended_at = '2026-07-31'
where id = '64fe381e-3bf7-48b5-ac79-d052854c87cc';

-- 강사 양성 교육 1회차: 07-13~07-15 → 07-20~07-22
update public.cohorts set
  started_at = '2026-07-20',
  ended_at = '2026-07-22'
where id = '25fbcbb3-410e-41bf-919a-a0ddaaae7fdb';

-- 강사 양성 교육 2회차: 08-18~08-20 → 08-24~08-26
update public.cohorts set
  started_at = '2026-08-24',
  ended_at = '2026-08-26'
where id = 'c90644d2-8e4d-4e0c-8e24-94999025e32f';

-- =========================================================================
-- C. DELETE — HWP에 없는 잉여 cohort (의존 데이터 0건 확인됨)
-- =========================================================================

delete from public.cohorts
where id in (
  -- AI 테크 브리핑 사례발표 1~5회차
  '35761ff9-efb1-4483-a991-5955164cf221',
  'b9630c33-f619-4754-b391-f98054fb182a',
  '72231ac6-90fe-4425-9760-dafad2275b3f',
  '73cecc9e-3ee5-4191-b07b-4bf89d4f60df',
  '32c5d21b-ec42-4fab-bba6-693dcf403585',
  -- 고위 공무원 특강 1~4회차
  'b6a1f459-3a5b-4865-b4ab-064503797238',
  'e595cf63-dda8-46f3-b3b1-be16bb78a666',
  '9701d7af-5e36-4f2b-857f-070809a074d1',
  'f86d5969-d134-4b5f-a2e6-8d59bd2ee710'
);

commit;
