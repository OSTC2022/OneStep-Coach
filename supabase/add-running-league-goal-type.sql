-- 참가자 개인 목표 유형

ALTER TABLE public.running_league_participants
  ADD COLUMN IF NOT EXISTS goal_type TEXT;

ALTER TABLE public.running_league_participants DROP CONSTRAINT IF EXISTS running_league_participants_goal_type_check;
ALTER TABLE public.running_league_participants
  ADD CONSTRAINT running_league_participants_goal_type_check
  CHECK (
    goal_type IS NULL
    OR goal_type IN (
      'finish',
      'record_improvement',
      'attendance',
      'mileage',
      'health',
      'race_prep'
    )
  );

ALTER TABLE public.running_league_goals
  ADD COLUMN IF NOT EXISTS goal_type TEXT;

ALTER TABLE public.running_league_goals DROP CONSTRAINT IF EXISTS running_league_goals_goal_type_check;
ALTER TABLE public.running_league_goals
  ADD CONSTRAINT running_league_goals_goal_type_check
  CHECK (
    goal_type IS NULL
    OR goal_type IN (
      'finish',
      'record_improvement',
      'attendance',
      'mileage',
      'health',
      'race_prep'
    )
  );

COMMENT ON COLUMN public.running_league_participants.goal_type IS 'finish | record_improvement | attendance | mileage | health | race_prep';
COMMENT ON COLUMN public.running_league_goals.goal_type IS '개인 목표 유형';

NOTIFY pgrst, 'reload schema';
