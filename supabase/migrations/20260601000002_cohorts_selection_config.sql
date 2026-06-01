-- 자동선발 적용 시 사용된 설정값을 cohort에 영구화.
-- 결과보고서·엑셀 export에서 "어떤 정책으로 뽑았는지" 표시하는 용도.
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS selection_config jsonb;

COMMENT ON COLUMN cohorts.selection_config IS
  '자동선발 적용 시 사용된 설정. 키: weights{knowledge,plan}, quotaRatio{central,local,public_edu}, maxPerOrg(0=무제한), excludeNoPrereq, totalCapacity, withReserve, effectiveCapacity, appliedAt';
