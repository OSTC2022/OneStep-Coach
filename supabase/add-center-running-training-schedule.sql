-- 센터 단독 주간 러닝 훈련 스케줄 (챌린지/리그와 무관)
-- 실행: Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.center_running_training_schedule_days (
  weekday SMALLINT PRIMARY KEY CHECK (weekday >= 0 AND weekday <= 6),
  training_summary TEXT NOT NULL DEFAULT '',
  location_label TEXT NOT NULL DEFAULT '',
  naver_map_url TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  schedule_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.center_running_training_schedule_days
  ADD COLUMN IF NOT EXISTS schedule_date DATE;

CREATE TABLE IF NOT EXISTS public.center_running_training_schedule_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday SMALLINT NOT NULL REFERENCES public.center_running_training_schedule_days(weekday) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (weekday, member_id)
);

CREATE INDEX IF NOT EXISTS center_running_training_schedule_signups_weekday_idx
  ON public.center_running_training_schedule_signups (weekday, created_at);

COMMENT ON TABLE public.center_running_training_schedule_days IS '센터 주간 러닝 훈련 스케줄 (월~일, 챌린지 무관)';
COMMENT ON COLUMN public.center_running_training_schedule_days.weekday IS '0=월 … 6=일';
COMMENT ON TABLE public.center_running_training_schedule_signups IS '센터 주간 훈련 참여 투표/신청';

ALTER TABLE public.center_running_training_schedule_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_running_training_schedule_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS center_running_training_schedule_days_admin_all ON public.center_running_training_schedule_days;
CREATE POLICY center_running_training_schedule_days_admin_all ON public.center_running_training_schedule_days
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS center_running_training_schedule_signups_admin_all ON public.center_running_training_schedule_signups;
CREATE POLICY center_running_training_schedule_signups_admin_all ON public.center_running_training_schedule_signups
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS center_running_training_schedule_days_member_read ON public.center_running_training_schedule_days;
CREATE POLICY center_running_training_schedule_days_member_read ON public.center_running_training_schedule_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS center_running_training_schedule_signups_member_read ON public.center_running_training_schedule_signups;
CREATE POLICY center_running_training_schedule_signups_member_read ON public.center_running_training_schedule_signups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS center_running_training_schedule_signups_member_write ON public.center_running_training_schedule_signups;
CREATE POLICY center_running_training_schedule_signups_member_write ON public.center_running_training_schedule_signups
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS center_running_training_schedule_signups_member_delete ON public.center_running_training_schedule_signups;
CREATE POLICY center_running_training_schedule_signups_member_delete ON public.center_running_training_schedule_signups
  FOR DELETE TO authenticated
  USING (public.running_league_member_owns_row(member_id));

NOTIFY pgrst, 'reload schema';
