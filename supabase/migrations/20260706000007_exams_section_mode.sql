-- 섹션 단위 CBT 전환 (객관식·단답·작업형 섹션별 타이머 + 문항 왔다갔다 + 검토 플래그)
--
-- 승우님 결정:
--   - 섹션 간 이동: 순차단방향 (다음 섹션 → 되돌아가기 X)
--   - 시간 초과: 자동 다음 섹션 (미응답 확정)
--   - 문항 개별 타이머: 제거 (섹션 타이머만)

-- 1. 시험별 섹션 시간(초) — 기본 30/10/20분
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS time_limit_mc int DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS time_limit_st int DEFAULT 600,
  ADD COLUMN IF NOT EXISTS time_limit_task int DEFAULT 1200;

COMMENT ON COLUMN public.exams.time_limit_mc IS '객관식 섹션 시간(초). 기본 1800(30분).';
COMMENT ON COLUMN public.exams.time_limit_st IS '단답형 섹션 시간(초). 기본 600(10분).';
COMMENT ON COLUMN public.exams.time_limit_task IS '작업형 섹션 시간(초). 기본 1200(20분).';

-- 2. 세션별 섹션 진행 상태
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS section_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS flagged_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.exam_sessions.section_progress IS
  '섹션별 시작/제출 시각. shape: { multiple_choice: {started_at, submitted_at}, short_text: {...}, task_based: {...} }';
COMMENT ON COLUMN public.exam_sessions.flagged_question_ids IS
  '검토 플래그가 걸린 question_id 배열. 응시자가 UI에서 🚩 토글로 관리.';

-- 3. 기존 문항 개별 타이머 무효화 (섹션 타이머만 사용하는 정책)
UPDATE public.exam_questions SET time_limit_seconds = NULL WHERE time_limit_seconds IS NOT NULL;
