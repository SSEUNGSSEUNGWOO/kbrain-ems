-- applicants에 prior_certs jsonb 컬럼 추가
-- 작년(2025) AI챔피언 인증자 명단을 지원자 마스터에 통합해 선발 화면에서
-- "이 사람은 그린 1회차 인증자다" 같은 정보를 노출하기 위한 컬럼.
-- 한 사람이 여러 인증을 보유할 수 있어 배열(jsonb)로 저장.
--
-- 항목 스키마:
-- {
--   "year": 2025,
--   "cert_no": "2025-GC0001",   -- 인증번호 (jsonb 안에서 unique key 역할)
--   "track": "green",            -- green | blue | expert | continuing
--   "round": 1,                   -- 회차 (없으면 null)
--   "kind": "교육형",             -- 교육형 | 자기주도형 | null
--   "event": null,                -- null | hackathon | miniproject | private(민간협업)
--   "organization": "...",        -- 인증 당시 소속 (부서까지 포함된 raw 텍스트)
--   "cert_name": "2025년 AI챔피언 그린"
-- }

alter table public.applicants
  add column if not exists prior_certs jsonb not null default '[]'::jsonb;

-- 트랙·연도 기반 필터·집계 빠르게 — jsonb_path_ops로 컴팩트 인덱스
create index if not exists applicants_prior_certs_gin
  on public.applicants
  using gin (prior_certs jsonb_path_ops);

comment on column public.applicants.prior_certs is
  '작년/이전 사업 AI챔피언 인증 이력 (배열). 항목 스키마는 마이그레이션 파일 참고.';
