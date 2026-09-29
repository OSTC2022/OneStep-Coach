-- 육상선수반 전용 주간 훈련 스케줄 (성인 러닝 스케줄과 분리)
-- 실행: Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.center_youth_athletics_training_schedule_days (
  weekday SMALLINT PRIMARY KEY CHECK (weekday >= 0 AND weekday <= 6),
  training_summary TEXT NOT NULL DEFAULT '',
  location_label TEXT NOT NULL DEFAULT '',
  naver_map_url TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  schedule_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.center_youth_athletics_training_schedule_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday SMALLINT NOT NULL REFERENCES public.center_youth_athletics_training_schedule_days(weekday) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  schedule_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS center_youth_athletics_training_schedule_signups_week_member_date_idx
  ON public.center_youth_athletics_training_schedule_signups (weekday, member_id, schedule_date)
  WHERE schedule_date IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS center_youth_athletics_training_schedule_signups_week_member_legacy_idx
  ON public.center_youth_athletics_training_schedule_signups (weekday, member_id)
  WHERE schedule_date IS NULL;

CREATE INDEX IF NOT EXISTS center_youth_athletics_training_schedule_signups_weekday_idx
  ON public.center_youth_athletics_training_schedule_signups (weekday, created_at);

CREATE TABLE IF NOT EXISTS public.center_youth_athletics_training_schedule_week_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date DATE,
  days JSONB NOT NULL DEFAULT '[]'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS center_youth_athletics_training_schedule_week_snapshots_week_idx
  ON public.center_youth_athletics_training_schedule_week_snapshots (week_start_date)
  WHERE week_start_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.center_youth_athletics_training_schedule_location_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_label TEXT NOT NULL DEFAULT '',
  naver_map_url TEXT NOT NULL DEFAULT '',
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_label, naver_map_url)
);

COMMENT ON TABLE public.center_youth_athletics_training_schedule_days IS '육상선수반 주간 훈련 스케줄 (월~일)';

ALTER TABLE public.center_youth_athletics_training_schedule_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_youth_athletics_training_schedule_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_youth_athletics_training_schedule_week_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_youth_athletics_training_schedule_location_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS youth_athletics_schedule_days_admin_all
  ON public.center_youth_athletics_training_schedule_days;
CREATE POLICY youth_athletics_schedule_days_admin_all
  ON public.center_youth_athletics_training_schedule_days
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS youth_athletics_schedule_signups_admin_all
  ON public.center_youth_athletics_training_schedule_signups;
CREATE POLICY youth_athletics_schedule_signups_admin_all
  ON public.center_youth_athletics_training_schedule_signups
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS youth_athletics_schedule_days_member_read
  ON public.center_youth_athletics_training_schedule_days;
CREATE POLICY youth_athletics_schedule_days_member_read
  ON public.center_youth_athletics_training_schedule_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS youth_athletics_schedule_signups_member_read
  ON public.center_youth_athletics_training_schedule_signups;
CREATE POLICY youth_athletics_schedule_signups_member_read
  ON public.center_youth_athletics_training_schedule_signups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS youth_athletics_schedule_signups_member_write
  ON public.center_youth_athletics_training_schedule_signups;
CREATE POLICY youth_athletics_schedule_signups_member_write
  ON public.center_youth_athletics_training_schedule_signups
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS youth_athletics_schedule_signups_member_delete
  ON public.center_youth_athletics_training_schedule_signups;
CREATE POLICY youth_athletics_schedule_signups_member_delete
  ON public.center_youth_athletics_training_schedule_signups
  FOR DELETE TO authenticated
  USING (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS youth_athletics_schedule_snapshots_admin_all
  ON public.center_youth_athletics_training_schedule_week_snapshots;
CREATE POLICY youth_athletics_schedule_snapshots_admin_all
  ON public.center_youth_athletics_training_schedule_week_snapshots
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS youth_athletics_schedule_locations_admin_all
  ON public.center_youth_athletics_training_schedule_location_presets;
CREATE POLICY youth_athletics_schedule_locations_admin_all
  ON public.center_youth_athletics_training_schedule_location_presets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';
