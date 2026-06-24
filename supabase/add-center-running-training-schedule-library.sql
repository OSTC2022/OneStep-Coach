-- 주간 스케줄 저장 목록 + 장소/지도 URL 프리셋
-- 실행: Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.center_running_training_schedule_week_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date DATE,
  days JSONB NOT NULL DEFAULT '[]'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS center_running_training_schedule_week_snapshots_week_idx
  ON public.center_running_training_schedule_week_snapshots (week_start_date)
  WHERE week_start_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS center_running_training_schedule_week_snapshots_saved_idx
  ON public.center_running_training_schedule_week_snapshots (saved_at DESC);

CREATE TABLE IF NOT EXISTS public.center_running_training_schedule_location_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_label TEXT NOT NULL DEFAULT '',
  naver_map_url TEXT NOT NULL DEFAULT '',
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_label, naver_map_url)
);

CREATE INDEX IF NOT EXISTS center_running_training_schedule_location_presets_saved_idx
  ON public.center_running_training_schedule_location_presets (saved_at DESC);

COMMENT ON TABLE public.center_running_training_schedule_week_snapshots IS '센터 러닝 주간 스케줄 저장 이력';
COMMENT ON TABLE public.center_running_training_schedule_location_presets IS '센터 러닝 스케줄 장소·지도 URL 프리셋';

ALTER TABLE public.center_running_training_schedule_week_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_running_training_schedule_location_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS center_running_training_schedule_week_snapshots_admin_all
  ON public.center_running_training_schedule_week_snapshots;
CREATE POLICY center_running_training_schedule_week_snapshots_admin_all
  ON public.center_running_training_schedule_week_snapshots
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS center_running_training_schedule_location_presets_admin_all
  ON public.center_running_training_schedule_location_presets;
CREATE POLICY center_running_training_schedule_location_presets_admin_all
  ON public.center_running_training_schedule_location_presets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';
