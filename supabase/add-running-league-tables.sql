-- ONE STEP RUNNING LEAGUE — 성인 러닝 리그 운영 테이블 (선수 챌린지와 분리)

CREATE TABLE IF NOT EXISTS public.running_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  board_post_id UUID REFERENCES public.center_board_posts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.running_league_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  goal_level TEXT,
  personal_goal TEXT,
  attendance_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  goal_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  record_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  mileage_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  recovery_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  mileage_km NUMERIC(8, 2) NOT NULL DEFAULT 0,
  record_baseline TEXT,
  record_current TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, member_id)
);

CREATE INDEX IF NOT EXISTS running_leagues_status_idx
  ON public.running_leagues (status, starts_at DESC);

CREATE INDEX IF NOT EXISTS running_league_participants_league_idx
  ON public.running_league_participants (league_id);

CREATE INDEX IF NOT EXISTS running_league_participants_member_idx
  ON public.running_league_participants (member_id);

ALTER TABLE public.running_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS running_leagues_admin_all ON public.running_leagues;
CREATE POLICY running_leagues_admin_all ON public.running_leagues
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_league_participants_admin_all ON public.running_league_participants;
CREATE POLICY running_league_participants_admin_all ON public.running_league_participants
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_leagues_member_read ON public.running_leagues;
CREATE POLICY running_leagues_member_read ON public.running_leagues
  FOR SELECT TO authenticated
  USING (
    status IN ('active', 'closed')
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_participants_member_read ON public.running_league_participants;
CREATE POLICY running_league_participants_member_read ON public.running_league_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.id = running_league_participants.member_id
        AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_participants_leaderboard_read ON public.running_league_participants;
CREATE POLICY running_league_participants_leaderboard_read ON public.running_league_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.running_leagues l
      WHERE l.id = running_league_participants.league_id
        AND l.status IN ('active', 'closed')
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

COMMENT ON TABLE public.running_leagues IS '성인 ONE STEP RUNNING LEAGUE 시즌';
COMMENT ON TABLE public.running_league_participants IS '러닝 리그 참가자·점수';

NOTIFY pgrst, 'reload schema';
