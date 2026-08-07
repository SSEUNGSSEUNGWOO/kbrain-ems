-- 지원자 예외 처리 — 삭제 대신 표시로 남긴다.
--
-- 왜 category 가 아니라 별도 컬럼인가:
--   category(소속구분) = "어디 소속인가", exclusion = "교육 대상인가" — 축이 다르다.
--   섞으면 소속구분 통계가 오염되고, 재업로드 시 지원자 응답으로 덮이는 문제도 생긴다.
--
-- 종류:
--   'test'         — 테스트·내부 계정. 실재하지 않는 사람이므로 모든 집계에서 제외
--   'not_eligible' — 사립대·민간 등 교육 대상 아님. 신청 건수엔 남기고 선발에서만 제외
--   'duplicate'    — 중복 등록 (merge 대상)

alter table public.applicants
  add column if not exists excluded_reason text
    check (excluded_reason in ('test', 'not_eligible', 'duplicate')),
  add column if not exists excluded_note text;

create index if not exists applicants_excluded_reason_idx
  on public.applicants (excluded_reason)
  where excluded_reason is not null;

comment on column public.applicants.excluded_reason is
  '예외 사유. null=정상 대상 / test=테스트·내부계정(집계 완전 제외) / not_eligible=대상 아님(선발만 제외) / duplicate=중복';
comment on column public.applicants.excluded_note is
  '예외 근거 메모. 예: "가천대 의과대학 — 사립대"';
