-- =====================================================
-- applications에 신청서 PDF 파일 정보 추가
-- =====================================================

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS application_file_path TEXT,
  ADD COLUMN IF NOT EXISTS application_file_name TEXT,
  ADD COLUMN IF NOT EXISTS application_file_size BIGINT;
