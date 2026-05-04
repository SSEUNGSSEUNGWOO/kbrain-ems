-- sessions: 휴식 시간(분) 추가
ALTER TABLE public.sessions ADD COLUMN break_minutes integer NOT NULL DEFAULT 0;
