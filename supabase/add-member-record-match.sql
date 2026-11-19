-- 대회 일정 기반 내 기록 맞추기 이벤트
-- Supabase SQL Editor에서 실행하세요.

CREATE TABLE IF NOT EXISTS public.member_record_match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marathon_event_id UUID NOT NULL REFERENCES public.center_marathon_events(id) ON DELETE CASCADE,
  distance TEXT,
  prize TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  winners JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.member_record_match_events
  ADD COLUMN IF NOT EXISTS winners JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.member_record_match_events
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS member_record_match_events_marathon_idx
  ON public.member_record_match_events (marathon_event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.member_record_match_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.member_record_match_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  predicted_seconds INTEGER NOT NULL CHECK (predicted_seconds > 0),
  actual_seconds INTEGER CHECK (actual_seconds IS NULL OR actual_seconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS member_record_match_entries_event_idx
  ON public.member_record_match_entries (event_id, created_at);

ALTER TABLE public.member_record_match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_record_match_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_record_match_events_read ON public.member_record_match_events;
CREATE POLICY member_record_match_events_read ON public.member_record_match_events
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS member_record_match_entries_read ON public.member_record_match_entries;
CREATE POLICY member_record_match_entries_read ON public.member_record_match_entries
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS member_record_match_events_insert ON public.member_record_match_events;
CREATE POLICY member_record_match_events_insert ON public.member_record_match_events
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'coach', 'instructor')
    )
  );

DROP POLICY IF EXISTS member_record_match_events_update ON public.member_record_match_events;
CREATE POLICY member_record_match_events_update ON public.member_record_match_events
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS member_record_match_events_delete ON public.member_record_match_events;
CREATE POLICY member_record_match_events_delete ON public.member_record_match_events
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'coach', 'instructor')
    )
  );

DROP POLICY IF EXISTS member_record_match_entries_write ON public.member_record_match_entries;
CREATE POLICY member_record_match_entries_write ON public.member_record_match_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.id = member_id
        AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS member_record_match_entries_update ON public.member_record_match_entries;
CREATE POLICY member_record_match_entries_update ON public.member_record_match_entries
  FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

COMMENT ON TABLE public.member_record_match_events IS '대회 일정 기준 내 기록 맞추기 이벤트와 상품';
COMMENT ON TABLE public.member_record_match_entries IS '회원이 제출한 예상 기록과 실제 기록';

NOTIFY pgrst, 'reload schema';
