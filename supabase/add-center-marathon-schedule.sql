-- 국내 마라톤 대회 일정 + 참가 신청
-- 실행: Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.center_marathon_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  event_date DATE NOT NULL,
  location_label TEXT NOT NULL DEFAULT '',
  registration_url TEXT,
  notes TEXT NOT NULL DEFAULT '',
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS center_marathon_events_event_date_idx
  ON public.center_marathon_events (event_date ASC);

CREATE TABLE IF NOT EXISTS public.center_marathon_event_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.center_marathon_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS center_marathon_event_signups_event_idx
  ON public.center_marathon_event_signups (event_id, created_at);

COMMENT ON TABLE public.center_marathon_events IS '국내 마라톤/대회 일정 (센터 러닝 포털)';
COMMENT ON COLUMN public.center_marathon_events.registration_url IS '참가신청 홈페이지 URL';
COMMENT ON TABLE public.center_marathon_event_signups IS '마라톤 일정 참여 신청';

ALTER TABLE public.center_marathon_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_marathon_event_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS center_marathon_events_admin_all ON public.center_marathon_events;
CREATE POLICY center_marathon_events_admin_all ON public.center_marathon_events
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS center_marathon_event_signups_admin_all ON public.center_marathon_event_signups;
CREATE POLICY center_marathon_event_signups_admin_all ON public.center_marathon_event_signups
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS center_marathon_events_member_read ON public.center_marathon_events;
CREATE POLICY center_marathon_events_member_read ON public.center_marathon_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS center_marathon_event_signups_member_read ON public.center_marathon_event_signups;
CREATE POLICY center_marathon_event_signups_member_read ON public.center_marathon_event_signups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS center_marathon_event_signups_member_write ON public.center_marathon_event_signups;
CREATE POLICY center_marathon_event_signups_member_write ON public.center_marathon_event_signups
  FOR INSERT TO authenticated
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS center_marathon_event_signups_member_delete ON public.center_marathon_event_signups;
CREATE POLICY center_marathon_event_signups_member_delete ON public.center_marathon_event_signups
  FOR DELETE TO authenticated
  USING (public.running_league_member_owns_row(member_id));

NOTIFY pgrst, 'reload schema';
