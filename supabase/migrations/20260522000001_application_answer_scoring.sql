-- 사전문항 응답 자동 채점·집계
--
-- application_answers에 응답이 insert/update/delete 되면:
--   1) BEFORE 트리거가 question의 correct_choice·weight를 보고 is_correct/score 자동 채움 (knowledge 섹션만)
--   2) AFTER 트리거가 applications의 knowledge_score / knowledge_correct_count / knowledge_total_count / self_diagnosis_avg 재계산
--
-- 외부 신청 시스템(홈페이지)에서 CSV/엑셀로 import할 때 import 코드는 그냥 answer_value만 넣으면 됨.

-- =====================================================
-- 1) 응답 행 채점 — BEFORE INSERT/UPDATE
-- =====================================================
CREATE OR REPLACE FUNCTION public.score_application_answer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  q RECORD;
BEGIN
  SELECT section, question_type, correct_choice, weight
    INTO q
    FROM public.application_questions
   WHERE id = NEW.question_id;

  IF NOT FOUND THEN
    -- 고아 응답 — question이 사라진 경우. 채점 대상 아님.
    NEW.is_correct := NULL;
    NEW.score := NULL;
    RETURN NEW;
  END IF;

  -- knowledge 섹션이면서 정답이 등록된 문항만 채점.
  IF q.section = 'knowledge'
     AND q.correct_choice IS NOT NULL
     AND NEW.answer_value IS NOT NULL
  THEN
    IF q.question_type = 'single' THEN
      -- answer_value: jsonb string ("①" 등) → text unwrap 후 correct_choice와 비교
      NEW.is_correct := (NEW.answer_value #>> '{}') = q.correct_choice;
      NEW.score := CASE WHEN NEW.is_correct THEN COALESCE(q.weight, 1) ELSE 0 END;
    ELSE
      -- multi 등 — 현재 채점 규칙 미정. 정답 미비교.
      NEW.is_correct := NULL;
      NEW.score := NULL;
    END IF;
  ELSE
    NEW.is_correct := NULL;
    NEW.score := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_answers_score_before ON public.application_answers;
CREATE TRIGGER application_answers_score_before
  BEFORE INSERT OR UPDATE OF answer_value, question_id
  ON public.application_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.score_application_answer();


-- =====================================================
-- 2) application 집계 재계산
-- =====================================================
CREATE OR REPLACE FUNCTION public.recalc_application_scores(p_application_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_score NUMERIC;
  v_correct INT;
  v_total INT;
  v_diag_avg NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(aa.score) FILTER (WHERE aq.section = 'knowledge'), 0),
    COUNT(*) FILTER (WHERE aq.section = 'knowledge' AND aa.is_correct = TRUE),
    COUNT(*) FILTER (WHERE aq.section = 'knowledge' AND aa.answer_value IS NOT NULL),
    AVG((aa.answer_value #>> '{}')::numeric) FILTER (
      WHERE aq.section = 'self_diagnosis'
        AND jsonb_typeof(aa.answer_value) = 'number'
    )
  INTO v_score, v_correct, v_total, v_diag_avg
  FROM public.application_answers aa
  JOIN public.application_questions aq ON aq.id = aa.question_id
  WHERE aa.application_id = p_application_id;

  UPDATE public.applications
     SET knowledge_score = v_score,
         knowledge_correct_count = v_correct,
         knowledge_total_count = v_total,
         self_diagnosis_avg = v_diag_avg
   WHERE id = p_application_id;
END;
$$;


-- =====================================================
-- 3) 응답 변경 시 집계 자동 갱신 — AFTER INSERT/UPDATE/DELETE
-- =====================================================
CREATE OR REPLACE FUNCTION public.trigger_recalc_application_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_application_scores(OLD.application_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_application_scores(NEW.application_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS application_answers_recalc_after ON public.application_answers;
CREATE TRIGGER application_answers_recalc_after
  AFTER INSERT OR UPDATE OR DELETE
  ON public.application_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalc_application_scores();


-- =====================================================
-- 4) 기존 행 재채점·집계 (마이그레이션 후 1회) — 현재 application_answers는 0건이라 no-op이지만
--    이후 정답·가중치가 변경되어 재채점 필요 시 아래 함수를 직접 호출:
--    SELECT public.recalc_application_scores(id) FROM public.applications;
-- =====================================================
COMMENT ON FUNCTION public.score_application_answer() IS
  'BEFORE INSERT/UPDATE on application_answers — knowledge 섹션 single 문항을 자동 채점하여 is_correct/score 채움.';
COMMENT ON FUNCTION public.recalc_application_scores(UUID) IS
  '한 application의 knowledge_score/correct_count/total_count/self_diagnosis_avg를 application_answers 기준으로 재계산.';
COMMENT ON FUNCTION public.trigger_recalc_application_scores() IS
  'AFTER INSERT/UPDATE/DELETE on application_answers — applications 집계 컬럼 자동 갱신.';
