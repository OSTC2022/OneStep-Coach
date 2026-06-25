-- PB 수정 이력(스냅샷) — 수정할 때마다 행이 추가되어 기록 목록·추이에 사용됩니다.

CREATE TABLE IF NOT EXISTS public.running_league_pb_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  distance_event TEXT NOT NULL CHECK (distance_event IN ('1km', '3km', '5km', '10km', 'half', 'full')),
  time_text TEXT NOT NULL,
  time_seconds INTEGER,
  measured_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_pb_snapshots_participant_distance_idx
  ON public.running_league_pb_snapshots (participant_id, distance_event, measured_at DESC, created_at DESC);

ALTER TABLE public.running_league_pb_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS running_league_pb_snapshots_member_all ON public.running_league_pb_snapshots;
CREATE POLICY running_league_pb_snapshots_member_all ON public.running_league_pb_snapshots
  FOR ALL TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_pb_snapshots_portal_read ON public.running_league_pb_snapshots;
CREATE POLICY running_league_pb_snapshots_portal_read ON public.running_league_pb_snapshots
  FOR SELECT TO authenticated
  USING (
    public.is_center_portal_ranking_league(league_id)
    AND public.is_approved_portal_member()
  );

COMMENT ON TABLE public.running_league_pb_snapshots IS
  '포털 PB 수정 이력 — 저장할 때마다 추가, 기록 목록·추이 그래프용';
