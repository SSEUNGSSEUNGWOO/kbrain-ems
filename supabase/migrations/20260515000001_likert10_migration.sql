-- 만족도 설문 척도 5점 → 10점 일괄 변경.
-- 1) survey_questions.type 'likert5' → 'likert10', options max/labels 갱신
-- 2) survey_responses.responses 안의 likert 응답값 ×2 단순 변환 (1→2, ..., 5→10)
--    텍스트 응답이나 다른 형태는 그대로 유지.

BEGIN;

-- 1) likert 문항 옵션 갱신 (type은 마지막에 변경)
UPDATE survey_questions
SET options = jsonb_build_object(
  'min', 1,
  'max', 10,
  'labels', jsonb_build_array(
    '매우 불만족', '', '', '', '보통', '', '', '', '', '매우 만족'
  )
)
WHERE type = 'likert5';

-- 2) 응답값 ×2 (likert5 문항 id 목록을 기준으로)
WITH likert_qs AS (
  SELECT id FROM survey_questions WHERE type = 'likert5'
)
UPDATE survey_responses sr
SET responses = (
  SELECT jsonb_object_agg(
    r.k,
    CASE
      WHEN jsonb_typeof(r.value) = 'number'
        AND EXISTS (SELECT 1 FROM likert_qs lq WHERE lq.id::text = r.k)
        THEN to_jsonb((r.value::text)::int * 2)
      ELSE r.value
    END
  )
  FROM jsonb_each(sr.responses) AS r(k, value)
)
WHERE responses IS NOT NULL
  AND responses != '{}'::jsonb;

-- 3) 마지막으로 type 변경
UPDATE survey_questions
SET type = 'likert10'
WHERE type = 'likert5';

COMMIT;
