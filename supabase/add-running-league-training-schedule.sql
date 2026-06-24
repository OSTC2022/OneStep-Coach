-- 주간 훈련 스케줄 (요일별) + 참여 신청
-- 실행: Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.running_league_training_schedule_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  training_summary TEXT NOT NULL DEFAULT '',
  location_label TEXT NOT NULL DEFAULT '',
  naver_map_url TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, weekday)
);

CREATE INDEX IF NOT EXISTS running_league_training_schedule_days_league_idx
  ON public.running_league_training_schedule_days (league_id, weekday);

CREATE TABLE IF NOT EXISTS public.running_league_training_schedule_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  schedule_day_id UUID NOT NULL REFERENCES public.running_league_training_schedule_days(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.running_league_participants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_day_id, member_id)
);

CREATE INDEX IF NOT EXISTS running_league_training_schedule_signups_day_idx
  ON public.running_league_training_schedule_signups (schedule_day_id, created_at);

COMMENT ON TABLE public.running_league_training_schedule_days IS '러닝 리그 주간 훈련 스케줄 (월~일)';
COMMENT ON COLUMN public.running_league_training_schedule_days.weekday IS '0=월 … 6=일';
COMMENT ON TABLE public.running_league_training_schedule_signups IS '요일별 그룹 러닝 참여 신청';

ALTER TABLE public.running_league_training_schedule_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_training_schedule_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS running_league_training_schedule_days_admin_all ON public.running_league_training_schedule_days;
CREATE POLICY running_league_training_schedule_days_admin_all ON public.running_league_training_schedule_days
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_league_training_schedule_signups_admin_all ON public.running_league_training_schedule_signups;
CREATE POLICY running_league_training_schedule_signups_admin_all ON public.running_league_training_schedule_signups
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS running_league_training_schedule_days_member_read ON public.running_league_training_schedule_days;
CREATE POLICY running_league_training_schedule_days_member_read ON public.running_league_training_schedule_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.running_leagues l
      WHERE l.id = running_league_training_schedule_days.league_id
        AND l.status IN ('active', 'closed')
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_training_schedule_signups_member_read ON public.running_league_training_schedule_signups;
CREATE POLICY running_league_training_schedule_signups_member_read ON public.running_league_training_schedule_signups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.running_leagues l
      WHERE l.id = running_league_training_schedule_signups.league_id
        AND l.status IN ('active', 'closed')
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_training_schedule_signups_member_write ON public.running_league_training_schedule_signups;
CREATE POLICY running_league_training_schedule_signups_member_write ON public.running_league_training_schedule_signups
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_training_schedule_signups_member_delete ON public.running_league_training_schedule_signups;
CREATE POLICY running_league_training_schedule_signups_member_delete ON public.running_league_training_schedule_signups
  FOR DELETE TO authenticated
  USING (public.running_league_member_owns_row(member_id));

NOTIFY pgrst, 'reload schema';
