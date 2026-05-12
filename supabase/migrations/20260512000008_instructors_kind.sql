-- instructors.kind — 'main' (강사) / 'sub' (보조강사) 분류
ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'main';
