-- 대회 참여 시 선택한 종목(5km/10km/하프/풀) 저장
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.center_marathon_event_signups
  ADD COLUMN IF NOT EXISTS distances JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.center_marathon_event_signups.distances IS
  '참가 종목 배열 — ["5km","10km","half","full"]';

CREATE INDEX IF NOT EXISTS center_marathon_event_signups_distances_gin
  ON public.center_marathon_event_signups
  USING GIN (distances);

-- 회원 본인 종목 수정 허용
DROP POLICY IF EXISTS center_marathon_event_signups_member_update ON public.center_marathon_event_signups;
CREATE POLICY center_marathon_event_signups_member_update ON public.center_marathon_event_signups
  FOR UPDATE TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

NOTIFY pgrst, 'reload schema';
