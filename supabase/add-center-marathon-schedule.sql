-- 마라톤 일정 (테이블 + 라벨 + RLS)
-- Supabase SQL Editor에서 이 파일 하나만 실행하세요.

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

-- 헬퍼가 없을 때만 최소 정의 (기존 함수는 덮어쓰지 않음)
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

COMMENT ON TABLE public.center_marathon_events IS '국내 마라톤/대회 일정 (센터 러닝 포털)';
COMMENT ON COLUMN public.center_marathon_events.registration_url IS '참가신청 홈페이지 URL';
COMMENT ON COLUMN public.center_marathon_events.region IS '지역 (서울/경기/부산 등)';
COMMENT ON COLUMN public.center_marathon_events.is_featured IS '인지도 있는 대회 라벨';
COMMENT ON COLUMN public.center_marathon_events.registration_open IS '참가신청 가능 라벨';
COMMENT ON COLUMN public.center_marathon_events.custom_labels IS '관리자 커스텀 라벨 [{text,tone}]';
COMMENT ON COLUMN public.center_marathon_events.catalog_key IS '추천 카탈로그에서 추가된 경우 중복 방지 키';
COMMENT ON COLUMN public.center_marathon_events.registration_end_date IS '참가신청 마감일 — 지나면 신청가능 라벨 숨김';
COMMENT ON COLUMN public.center_marathon_events.is_pinned IS '회원 포털 대회 일정 상단 고정';
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
