-- =====================================================
-- 5/7 만족도 설문 시드
-- 2026 AI 챔피언 고급 과정(5.7) 만족도 조사
--
-- 전제: 20260511000002_survey_extensions.sql 적용된 상태.
-- 구성: 강사 2명 + 세션 2개 + 설문 1개 + 문항 27개 (척도 12 + 주관식 15)
-- =====================================================

DO $$
DECLARE
  v_cohort_id           UUID;
  v_instructor_anjin    UUID;
  v_instructor_shin     UUID;
  v_session_special     UUID;
  v_session_tech1       UUID;
  v_survey_id           UUID;
  v_scale_options       JSONB := '{"min":1,"max":10,"min_label":"매우 불만족","max_label":"매우 만족"}'::jsonb;
  v_section_4_title     TEXT := '강사 만족도 (안진희 사무관) — 특강: AI는 도구, 핵심은 사람';
  v_section_5_title     TEXT := '강사 만족도 (신성진 강사) — 기술교육 1회차: AI 에이전트 시대 이해';
BEGIN
  -- 1) cohort 조회
  SELECT id INTO v_cohort_id FROM public.cohorts WHERE name = '전문인재 26-1기';
  IF v_cohort_id IS NULL THEN
    RAISE EXCEPTION 'cohort "전문인재 26-1기"가 없습니다. seed.sql을 먼저 적용하세요.';
  END IF;

  -- 2) 강사 마스터
  INSERT INTO public.instructors (name, affiliation, specialty)
  VALUES ('안진희', '사무관', 'AI 정책·기획')
  RETURNING id INTO v_instructor_anjin;

  INSERT INTO public.instructors (name, specialty)
  VALUES ('신성진', 'AI 에이전트·기술')
  RETURNING id INTO v_instructor_shin;

  -- 3) 5/7 세션 2개
  INSERT INTO public.sessions (cohort_id, session_date, title)
  VALUES (v_cohort_id, '2026-05-07', '특강: AI는 도구, 핵심은 사람')
  RETURNING id INTO v_session_special;

  INSERT INTO public.sessions (cohort_id, session_date, title)
  VALUES (v_cohort_id, '2026-05-07', '기술교육 1회차: AI 에이전트 시대 이해')
  RETURNING id INTO v_session_tech1;

  -- 4) 세션-강사 매핑
  INSERT INTO public.session_instructors (session_id, instructor_id, role)
  VALUES (v_session_special, v_instructor_anjin, 'main'),
         (v_session_tech1, v_instructor_shin, 'main');

  -- 5) 설문 1개
  INSERT INTO public.surveys (cohort_id, title, type, scope)
  VALUES (
    v_cohort_id,
    '2026 AI 챔피언 고급 과정(5.7) 만족도 조사',
    'satisfaction',
    'session'
  )
  RETURNING id INTO v_survey_id;

  -- 6) 문항 27개
  INSERT INTO public.survey_questions
    (survey_id, question_no, type, text, required, section_no, section_title, instructor_id, options)
  VALUES
    -- ===== 섹션 1: 교육 프로그램 전반 (4문항) =====
    (v_survey_id,  1, 'likert10', '이번 프로그램 전반에 대하여 얼마나 만족하셨습니까?',
     true,  1, '교육 프로그램에 대한 전반적인 만족도', NULL, v_scale_options),
    (v_survey_id,  2, 'text', '불만족 시 사유',
     false, 1, '교육 프로그램에 대한 전반적인 만족도', NULL, NULL),
    (v_survey_id,  3, 'likert10', '이번 프로그램을 다른 사람에게 추천하실 의향이 있으십니까?',
     true,  1, '교육 프로그램에 대한 전반적인 만족도', NULL, v_scale_options),
    (v_survey_id,  4, 'text', '추천하지 않으실 경우 사유',
     false, 1, '교육 프로그램에 대한 전반적인 만족도', NULL, NULL),

    -- ===== 섹션 2: 교육 내용 (2문항) =====
    (v_survey_id,  5, 'likert10', '본 과정은 학습자 수준에 맞춰 체계적인 내용으로 구성되었습니까?',
     true,  2, '교육 내용 만족도', NULL, v_scale_options),
    (v_survey_id,  6, 'text', '불만족 시 사유',
     false, 2, '교육 내용 만족도', NULL, NULL),

    -- ===== 섹션 3: 환경 (6문항) =====
    (v_survey_id,  7, 'likert10', '본 과정의 교육 시설 및 환경에 만족하셨습니까?',
     true,  3, '환경 만족도', NULL, v_scale_options),
    (v_survey_id,  8, 'text', '시설·환경 불만족 시 사유',
     false, 3, '환경 만족도', NULL, NULL),
    (v_survey_id,  9, 'likert10', '본 과정을 위해 주어진 시간은 적절하였습니까?',
     true,  3, '환경 만족도', NULL, v_scale_options),
    (v_survey_id, 10, 'text', '시간 적절성 불만족 시 사유',
     false, 3, '환경 만족도', NULL, NULL),
    (v_survey_id, 11, 'likert10', '본 과정을 위한 운영·지원에 대하여 만족하셨습니까?',
     true,  3, '환경 만족도', NULL, v_scale_options),
    (v_survey_id, 12, 'text', '운영·지원 불만족 시 사유',
     false, 3, '환경 만족도', NULL, NULL),

    -- ===== 섹션 4: 강사 만족도 (안진희 사무관) (6문항) =====
    (v_survey_id, 13, 'likert10', '본 과정의 강사는 교육을 열정적으로 이끌었습니까?',
     true,  4, v_section_4_title, v_instructor_anjin, v_scale_options),
    (v_survey_id, 14, 'text', '열정 부분 불만족 시 사유',
     false, 4, v_section_4_title, v_instructor_anjin, NULL),
    (v_survey_id, 15, 'likert10', '본 과정의 강사는 질의응답 혹은 피드백에 적극적으로 답하였습니까?',
     true,  4, v_section_4_title, v_instructor_anjin, v_scale_options),
    (v_survey_id, 16, 'text', '질의응답·피드백 불만족 시 사유',
     false, 4, v_section_4_title, v_instructor_anjin, NULL),
    (v_survey_id, 17, 'likert10', '본 과정의 난이도는 대체로 적절하였습니까?',
     true,  4, v_section_4_title, v_instructor_anjin, v_scale_options),
    (v_survey_id, 18, 'text', '난이도 불만족 시 사유',
     false, 4, v_section_4_title, v_instructor_anjin, NULL),

    -- ===== 섹션 5: 강사 만족도 (신성진 강사) (6문항) =====
    (v_survey_id, 19, 'likert10', '본 과정의 강사는 교육을 열정적으로 이끌었습니까?',
     true,  5, v_section_5_title, v_instructor_shin, v_scale_options),
    (v_survey_id, 20, 'text', '열정 부분 불만족 시 사유',
     false, 5, v_section_5_title, v_instructor_shin, NULL),
    (v_survey_id, 21, 'likert10', '본 과정의 강사는 질의응답 혹은 피드백에 적극적으로 답하였습니까?',
     true,  5, v_section_5_title, v_instructor_shin, v_scale_options),
    (v_survey_id, 22, 'text', '질의응답·피드백 불만족 시 사유',
     false, 5, v_section_5_title, v_instructor_shin, NULL),
    (v_survey_id, 23, 'likert10', '본 과정의 난이도는 대체로 적절하였습니까?',
     true,  5, v_section_5_title, v_instructor_shin, v_scale_options),
    (v_survey_id, 24, 'text', '난이도 불만족 시 사유',
     false, 5, v_section_5_title, v_instructor_shin, NULL),

    -- ===== 섹션 6: 서술형 (3문항) =====
    (v_survey_id, 25, 'text', '교육 진행 중 유익하고 좋았던 점을 자유롭게 작성해 주세요.',
     false, 6, '서술형', NULL, NULL),
    (v_survey_id, 26, 'text', '교육 진행 중 개선되었으면 하는 점을 자유롭게 작성해 주세요.',
     false, 6, '서술형', NULL, NULL),
    (v_survey_id, 27, 'text', '전문인재 인증자 특강 관련 희망 방향 및 주제를 자유롭게 작성해 주세요. (매주 교육마다 진행 예정)',
     false, 6, '서술형', NULL, NULL);

  RAISE NOTICE '설문 시드 완료. survey_id=%, 강사 2명, 세션 2개, 문항 27개.', v_survey_id;
END $$;
