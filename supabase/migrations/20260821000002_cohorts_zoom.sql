-- 비대면 과정의 Zoom 접속 정보.
--
-- locations 는 물리 교육장(DMC타워 등)용이라 온라인 회의 정보를 담을 자리가 없었다.
-- 안내 문자·메일과 안내서 PDF 가 회차마다 이 값을 필요로 하는데, 저장할 곳이 없으면
-- 담당자가 매번 손으로 넣게 되고 지난 회차 비밀번호가 그대로 복사된다.

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS zoom_meeting_id TEXT,
  ADD COLUMN IF NOT EXISTS zoom_password TEXT;

COMMENT ON COLUMN public.cohorts.zoom_meeting_id IS 'Zoom 회의 ID. 비대면 과정만 사용.';
COMMENT ON COLUMN public.cohorts.zoom_password IS 'Zoom 회의 비밀번호. 회차마다 바뀐다.';
