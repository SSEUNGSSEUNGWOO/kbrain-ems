-- 만족도조사 결과보고서: LLM 생성 요약(주요 성과·주관식 요약·개선 방향) 저장
alter table public.surveys
  add column if not exists report_summary jsonb;

comment on column public.surveys.report_summary is
  '결과보고서 파트1 LLM 요약 { generated_at, model, key_findings, positive_tags, positive_bullets, suggestion_tags, suggestion_bullets, improvements, minor_feedback }';
