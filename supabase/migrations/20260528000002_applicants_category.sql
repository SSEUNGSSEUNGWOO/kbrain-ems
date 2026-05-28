-- 지원자 분류(category) 컬럼 추가 + 기존 applicants를 C2 응답으로 backfill.
-- 정책: 자동 분류(소속명 정규식) 폐기. 신청자가 직접 고른 C2 응답을 그대로 분류로 사용.
-- 한 사람이 여러 cohort에 지원한 경우 최신(applied_at DESC) 응답 우선.

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS category TEXT;

COMMENT ON COLUMN public.applicants.category IS
  '소속기관 형태 분류(중앙부처 | 광역지자체 | 기초지자체 | 공공기관 | 교육행정기관 | 기타). C2 응답에서 자동 채움. NULL = 미분류.';

-- backfill: 모든 applicants에 대해 최신 application의 C2 응답을 한글 라벨로 변환해 저장
UPDATE public.applicants a
SET category = sub.cat
FROM (
  SELECT DISTINCT ON (app.applicant_id)
    app.applicant_id,
    CASE (aa.answer_value #>> '{}')
      WHEN '①' THEN '중앙부처'
      WHEN '②' THEN '광역지자체'
      WHEN '③' THEN '기초지자체'
      WHEN '④' THEN '공공기관'
      WHEN '⑤' THEN '교육행정기관'
      WHEN '⑥' THEN '기타'
    END AS cat
  FROM public.application_answers aa
  JOIN public.application_questions aq ON aq.id = aa.question_id
  JOIN public.applications app ON app.id = aa.application_id
  WHERE aq.question_no = 'C2'
    AND aa.answer_value IS NOT NULL
  ORDER BY app.applicant_id, app.applied_at DESC NULLS LAST, app.created_at DESC
) sub
WHERE a.id = sub.applicant_id
  AND sub.cat IS NOT NULL;
