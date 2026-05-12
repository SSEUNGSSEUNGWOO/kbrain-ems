-- session_operators — session × operator 다대다 매핑
CREATE TABLE IF NOT EXISTS public.session_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, operator_id)
);
CREATE INDEX IF NOT EXISTS session_operators_session_idx ON public.session_operators(session_id);
CREATE INDEX IF NOT EXISTS session_operators_operator_idx ON public.session_operators(operator_id);

ALTER TABLE public.session_operators ENABLE ROW LEVEL SECURITY;
