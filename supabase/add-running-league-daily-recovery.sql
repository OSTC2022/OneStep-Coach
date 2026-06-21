-- ONE STEP RUNNING LEAGUE 일일 회복관리 체크
-- 컨디션·통증·스트레칭·강도·코치 강도 준수를 날짜별로 기록합니다.

CREATE TABLE IF NOT EXISTS public.running_league_daily_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  condition TEXT NOT NULL CHECK (condition IN ('good', 'normal', 'tired')),
  pain TEXT NOT NULL CHECK (pain IN ('none', 'mild', 'severe')),
  stretching TEXT NOT NULL CHECK (stretching IN ('done', 'not_done')),
  intensity TEXT NOT NULL CHECK (intensity IN ('light', 'moderate', 'hard', 'excessive')),
  coach_compliance TEXT NOT NULL CHECK (coach_compliance IN ('followed', 'slightly_fast', 'excessive')),
  points NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_id, logged_at)
);

CREATE INDEX IF NOT EXISTS running_league_daily_recovery_league_idx
  ON public.running_league_daily_recovery (league_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS running_league_daily_recovery_member_idx
  ON public.running_league_daily_recovery (member_id, league_id, logged_at DESC);

COMMENT ON TABLE public.running_league_daily_recovery IS '러닝 리그 일일 회복관리 체크 (컨디션·통증·스트레칭·강도)';

ALTER TABLE public.running_league_daily_recovery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS running_league_daily_recovery_admin_all ON public.running_league_daily_recovery;
CREATE POLICY running_league_daily_recovery_admin_all ON public.running_league_daily_recovery
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_league_daily_recovery_member_read ON public.running_league_daily_recovery;
CREATE POLICY running_league_daily_recovery_member_read ON public.running_league_daily_recovery
  FOR SELECT TO authenticated
  USING (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_daily_recovery_member_write ON public.running_league_daily_recovery;
CREATE POLICY running_league_daily_recovery_member_write ON public.running_league_daily_recovery
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_daily_recovery_member_update ON public.running_league_daily_recovery;
CREATE POLICY running_league_daily_recovery_member_update ON public.running_league_daily_recovery
  FOR UPDATE TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));
