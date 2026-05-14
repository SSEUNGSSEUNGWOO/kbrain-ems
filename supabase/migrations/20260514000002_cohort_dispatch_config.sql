-- cohort × 알림 단계 활성화 설정.
-- row 없으면 enabled=true로 간주 (페이지 측 기본값).
-- 비활성화 시 row insert(enabled=false).

CREATE TABLE IF NOT EXISTS cohort_dispatch_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, template_code)
);

CREATE INDEX IF NOT EXISTS cohort_dispatch_config_cohort_idx ON cohort_dispatch_config(cohort_id);

CREATE TRIGGER cohort_dispatch_config_set_updated_at
  BEFORE UPDATE ON cohort_dispatch_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE cohort_dispatch_config ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cohort_dispatch_config IS
  'cohort별 알림 단계 활성화 설정. row 없으면 enabled=true 기본값. dispatch-stages.ts의 STAGE_CATALOG와 매칭.';
