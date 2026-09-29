-- 육상선수반: 주 종목 2개 + PB 기록
-- 실행: Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.youth_athletics_athlete_profiles (
  member_id UUID PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  primary_event_1 TEXT,
  primary_event_2 TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youth_athletics_pb_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  result_text TEXT NOT NULL,
  result_value NUMERIC NOT NULL,
  result_kind TEXT NOT NULL DEFAULT 'time'
    CHECK (result_kind IN ('time', 'mark')),
  measured_at DATE NOT NULL DEFAULT (CURRENT_DATE),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS youth_athletics_pb_records_member_event_date_idx
  ON public.youth_athletics_pb_records (member_id, event_key, measured_at ASC, created_at ASC);

COMMENT ON TABLE public.youth_athletics_athlete_profiles IS '육상선수반 주 종목(최대 2개)';
COMMENT ON TABLE public.youth_athletics_pb_records IS '육상선수반 개인 최고(PB) 이력';

ALTER TABLE public.youth_athletics_athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youth_athletics_pb_records ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.youth_athletics_athlete_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.youth_athletics_athlete_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.youth_athletics_pb_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.youth_athletics_pb_records TO service_role;

DROP POLICY IF EXISTS youth_athletics_profiles_admin_all
  ON public.youth_athletics_athlete_profiles;
CREATE POLICY youth_athletics_profiles_admin_all
  ON public.youth_athletics_athlete_profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS youth_athletics_profiles_member_all
  ON public.youth_athletics_athlete_profiles;
CREATE POLICY youth_athletics_profiles_member_all
  ON public.youth_athletics_athlete_profiles
  FOR ALL TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS youth_athletics_profiles_coach_read
  ON public.youth_athletics_athlete_profiles;
CREATE POLICY youth_athletics_profiles_coach_read
  ON public.youth_athletics_athlete_profiles
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = youth_athletics_athlete_profiles.member_id
        AND m.primary_instructor_id = public.current_instructor_id()
    )
  );

DROP POLICY IF EXISTS youth_athletics_pb_admin_all
  ON public.youth_athletics_pb_records;
CREATE POLICY youth_athletics_pb_admin_all
  ON public.youth_athletics_pb_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS youth_athletics_pb_member_all
  ON public.youth_athletics_pb_records;
CREATE POLICY youth_athletics_pb_member_all
  ON public.youth_athletics_pb_records
  FOR ALL TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS youth_athletics_pb_coach_read
  ON public.youth_athletics_pb_records;
CREATE POLICY youth_athletics_pb_coach_read
  ON public.youth_athletics_pb_records
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = youth_athletics_pb_records.member_id
        AND m.primary_instructor_id = public.current_instructor_id()
    )
  );

NOTIFY pgrst, 'reload schema';
