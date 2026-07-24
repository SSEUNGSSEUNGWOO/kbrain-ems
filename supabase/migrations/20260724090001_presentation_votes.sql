-- 발표 후 실시간 투표 (1,2,3등 뽑기).
-- 공개 링크·QR로 접근, 이름만 입력, 정확히 3명 선택.
CREATE TABLE IF NOT EXISTS public.presentation_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  share_code text NOT NULL UNIQUE,
  max_selections int NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS presentation_votes_cohort_idx ON public.presentation_votes(cohort_id);

CREATE TABLE IF NOT EXISTS public.presentation_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id uuid NOT NULL REFERENCES public.presentation_votes(id) ON DELETE CASCADE,
  order_no int NOT NULL,
  presenter text NOT NULL,
  topic text,
  cover_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vote_id, order_no)
);

CREATE INDEX IF NOT EXISTS presentation_candidates_vote_idx ON public.presentation_candidates(vote_id);

CREATE TABLE IF NOT EXISTS public.presentation_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id uuid NOT NULL REFERENCES public.presentation_votes(id) ON DELETE CASCADE,
  voter_name text NOT NULL,
  device_key text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS presentation_ballots_vote_idx ON public.presentation_ballots(vote_id);
CREATE INDEX IF NOT EXISTS presentation_ballots_device_idx ON public.presentation_ballots(vote_id, device_key) WHERE device_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.presentation_ballot_items (
  ballot_id uuid NOT NULL REFERENCES public.presentation_ballots(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.presentation_candidates(id) ON DELETE CASCADE,
  PRIMARY KEY (ballot_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS presentation_ballot_items_candidate_idx ON public.presentation_ballot_items(candidate_id);

COMMENT ON TABLE public.presentation_votes IS
  '발표 후 실시간 투표 이벤트. share_code로 공개 접근, status로 오픈/클로즈 제어.';
COMMENT ON COLUMN public.presentation_votes.share_code IS
  '공개 링크 slug. /vote/[code] 진입';
COMMENT ON COLUMN public.presentation_votes.max_selections IS
  '투표자 1인이 선택해야 하는 후보 수 (기본 3, 정확히 이 값만큼 선택 강제)';
COMMENT ON TABLE public.presentation_candidates IS
  '발표 후보. order_no는 발표 순번 겸 UI 표시 순서.';
COMMENT ON COLUMN public.presentation_candidates.cover_image_url IS
  '표지 이미지 URL. 정적 경로(/presentation-covers/{n}.png) 또는 외부 URL 사용 가능.';
COMMENT ON TABLE public.presentation_ballots IS
  '투표 제출 단위 (1명=1행). voter_name은 익명, device_key는 브라우저 fingerprint (소프트 중복 방지).';
COMMENT ON TABLE public.presentation_ballot_items IS
  '한 ballot의 선택 후보들 (max_selections개, 정확히 그 수만큼 삽입).';
