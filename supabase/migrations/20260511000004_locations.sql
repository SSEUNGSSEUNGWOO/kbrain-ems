-- =====================================================
-- locations 테이블 + public.sessions.location_id
--
-- 수업 장소 드롭다운용. public 스키마 명시 — Supabase는 auth.sessions가
-- 따로 존재해서 schema 안 쓰면 SQL Editor가 모호하게 인식할 수 있음.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER locations_set_updated_at
  BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sessions_location_idx ON public.sessions(location_id);

-- 초기 데이터
INSERT INTO public.locations (name) VALUES
  ('DMC타워 교육장'),
  ('NIA 서울사무소')
ON CONFLICT (name) DO NOTHING;
