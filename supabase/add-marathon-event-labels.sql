-- 하위 호환: 라벨만 추가하려 했을 때 → 전체 마이그레이션으로 위임
-- 실제 내용은 add-center-marathon-schedule.sql 과 동일합니다.
-- Supabase에서는 \i 가 안 되므로, add-center-marathon-schedule.sql 을 실행하세요.

-- (아래는 동일 스크립트 복제 — 어느 쪽을 실행해도 됩니다)

CREATE TABLE IF NOT EXISTS public.center_marathon_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  event_date DATE NOT NULL,
  location_label TEXT NOT NULL DEFAULT '',
  registration_url TEXT,
  notes TEXT NOT NULL DEFAULT '',
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  region TEXT NOT NULL DEFAULT '',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  registration_open BOOLEAN NOT NULL DEFAULT false,
  custom_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  catalog_key TEXT,
  registration_end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.center_marathon_events
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT '';
ALTER TABLE public.center_marathon_events
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.center_marathon_events
  ADD COLUMN IF NOT EXISTS registration_open BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.center_marathon_events
  ADD COLUMN IF NOT EXISTS custom_labels JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.center_marathon_events
  ADD COLUMN IF NOT EXISTS catalog_key TEXT;
ALTER TABLE public.center_marathon_events
  ADD COLUMN IF NOT EXISTS registration_end_date DATE;
ALTER TABLE public.center_marathon_events
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.center_marathon_event_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.center_marathon_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS center_marathon_events_event_date_idx
  ON public.center_marathon_events (event_date ASC);

CREATE UNIQUE INDEX IF NOT EXISTS center_marathon_events_catalog_key_uidx
  ON public.center_marathon_events (catalog_key)
  WHERE catalog_key IS NOT NULL AND length(trim(catalog_key)) > 0;

CREATE INDEX IF NOT EXISTS center_marathon_events_region_idx
  ON public.center_marathon_events (region);

CREATE INDEX IF NOT EXISTS center_marathon_event_signups_event_idx
  ON public.center_marathon_event_signups (event_id, created_at);

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.is_admin()
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role::text = 'admin'
        );
      $body$;
    $fn$;
  END IF;

  IF to_regprocedure('public.running_league_member_owns_row(uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.running_league_member_owns_row(target_member_id UUID)
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT EXISTS (
          SELECT 1
          FROM public.members m
          WHERE m.id = target_member_id
            AND (
              m.auth_user_id = auth.uid()
              OR m.user_id = auth.uid()
            )
        );
      $body$;
    $fn$;
  END IF;
END $$;

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

COMMENT ON COLUMN public.center_marathon_events.registration_end_date IS '참가신청 마감일 — 지나면 신청가능 라벨 숨김';

NOTIFY pgrst, 'reload schema';
