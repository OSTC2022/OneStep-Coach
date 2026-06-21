-- 러닝 리그 대상 그룹

ALTER TABLE public.running_leagues
  ADD COLUMN IF NOT EXISTS target_group TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.running_leagues DROP CONSTRAINT IF EXISTS running_leagues_target_group_check;
ALTER TABLE public.running_leagues
  ADD CONSTRAINT running_leagues_target_group_check
  CHECK (target_group IN ('all', 'beginner', '5km', '10km', 'half_marathon'));

COMMENT ON COLUMN public.running_leagues.target_group IS 'all | beginner | 5km | 10km | half_marathon';

NOTIFY pgrst, 'reload schema';
