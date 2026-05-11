-- =====================================================
-- Survey 확장 — 섹션 그룹 + 강사별 문항 매핑
--
-- 기존 survey_questions에 다음 컬럼 추가:
--   section_no    : 섹션 번호 (UI 그룹 헤더)
--   section_title : 섹션 제목 (예: "교육 프로그램에 대한 전반적인 만족도")
--   instructor_id : 강사 만족도 섹션의 대상 강사 (nullable)
--
-- type은 기존 likert5/text/choice에 더해 likert10 사용 (1~10 척도).
-- 별도 enum 강제 안 함 (TEXT 기반이므로 application 레벨에서 검증).
-- =====================================================

ALTER TABLE survey_questions
  ADD COLUMN IF NOT EXISTS section_no INTEGER,
  ADD COLUMN IF NOT EXISTS section_title TEXT,
  ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS survey_questions_section_idx
  ON survey_questions(survey_id, section_no, question_no);

CREATE INDEX IF NOT EXISTS survey_questions_instructor_idx
  ON survey_questions(instructor_id);
