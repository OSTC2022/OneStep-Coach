-- ONE STEP RUNNING LEAGUE — 스키마 확장
-- 기존 running_leagues / running_league_participants 를 유지하고 보조 테이블을 추가합니다.
-- (사용자 예시의 running_challenges 등은 아래 COMMENT 매핑 참고)
--
-- 매핑:
--   running_leagues              ≈ running_challenges
--   running_league_participants  ≈ running_challenge_participants
--   running_league_goals         ≈ running_challenge_goals
--   running_league_records       ≈ running_challenge_records
--   running_league_mileage_logs  ≈ running_challenge_mileage
--   running_league_recovery_logs ≈ running_challenge_recovery_logs
--   running_league_score_snapshots ≈ running_challenge_scores
--   running_league_awards        ≈ running_challenge_awards
--   running_league_reports       ≈ running_challenge_reports

-- ---------------------------------------------------------------------------
-- 1. 기존 테이블 확장
-- ---------------------------------------------------------------------------

ALTER TABLE public.running_leagues
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

ALTER TABLE public.running_leagues DROP CONSTRAINT IF EXISTS running_leagues_audience_check;
ALTER TABLE public.running_leagues
  ADD CONSTRAINT running_leagues_audience_check
  CHECK (audience IN ('adult'));

COMMENT ON COLUMN public.running_leagues.audience IS 'adult 전용 — 선수 성장 챌린지와 분리';
COMMENT ON COLUMN public.running_leagues.status IS 'draft=예정, active=진행중, closed=종료';

ALTER TABLE public.running_league_participants
  ADD COLUMN IF NOT EXISTS coach_comment TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS goal_achievement_rate NUMERIC(5, 2);

COMMENT ON COLUMN public.running_league_participants.notes IS '관리자 내부 메모';
COMMENT ON COLUMN public.running_league_participants.coach_comment IS '회원 리포트에 노출되는 코치 코멘트';
COMMENT ON COLUMN public.running_league_participants.goal_achievement_rate IS '목표 달성률 0~100';
COMMENT ON COLUMN public.running_league_participants.mileage_km IS '월 누적 거리(km), 80km 이상 만점(100점)';

-- 총점: 앱과 동일한 가중치 (30/25/20/15/10)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'running_league_participants'
      AND column_name = 'total_score'
  ) THEN
    ALTER TABLE public.running_league_participants
      ADD COLUMN total_score NUMERIC(6, 2) GENERATED ALWAYS AS (
        ROUND(
          LEAST(GREATEST(attendance_score, 0), 100) * 0.30 +
          LEAST(GREATEST(goal_score, 0), 100) * 0.25 +
          LEAST(GREATEST(record_score, 0), 100) * 0.20 +
          LEAST(GREATEST(mileage_score, 0), 100) * 0.15 +
          LEAST(GREATEST(recovery_score, 0), 100) * 0.10,
          1
        )
      ) STORED;
  END IF;
END $$;

-- 마일리지 점수 환산 (80km 만점)
CREATE OR REPLACE FUNCTION public.running_league_mileage_score(km NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN km >= 80 THEN 100
    WHEN km >= 60 THEN 80
    WHEN km >= 40 THEN 60
    WHEN km >= 20 THEN 40
    WHEN km <= 0 THEN 0
    ELSE ROUND((km / 20.0) * 40, 2)
  END;
$$;

COMMENT ON FUNCTION public.running_league_mileage_score IS '러닝 마일리지 점수 — 20/40/60/80km 구간, 80km 이상 100점 상한';

-- ---------------------------------------------------------------------------
-- 2. 보조 테이블
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.running_league_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  goal_level TEXT,
  personal_goal TEXT NOT NULL DEFAULT '',
  achievement_rate NUMERIC(5, 2),
  goal_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  week_number INTEGER,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS running_league_goals_primary_uidx
  ON public.running_league_goals (participant_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS running_league_goals_member_idx
  ON public.running_league_goals (member_id, league_id);

CREATE TABLE IF NOT EXISTS public.running_league_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  distance_event TEXT NOT NULL CHECK (distance_event IN ('1km', '3km', '5km', '10km')),
  record_phase TEXT NOT NULL CHECK (record_phase IN ('month_start', 'month_end', 'mid_month', 'other')),
  time_text TEXT,
  time_seconds INTEGER,
  measured_at DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_id, distance_event, record_phase)
);

CREATE INDEX IF NOT EXISTS running_league_records_member_idx
  ON public.running_league_records (member_id, league_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_mileage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  distance_km NUMERIC(8, 2) NOT NULL CHECK (distance_km > 0),
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'lesson', 'import', 'other')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_mileage_logs_member_idx
  ON public.running_league_mileage_logs (member_id, league_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_recovery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL CHECK (
    check_type IN (
      'stretching',
      'pain_check',
      'condition_check',
      'recovery_jog',
      'intensity_compliance'
    )
  ),
  completed BOOLEAN NOT NULL DEFAULT false,
  points NUMERIC(5, 2) NOT NULL DEFAULT 0,
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_recovery_logs_member_idx
  ON public.running_league_recovery_logs (member_id, league_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  attendance_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  goal_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  record_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  mileage_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  recovery_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
  week_number INTEGER,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_score_snapshots_member_idx
  ON public.running_league_score_snapshots (member_id, league_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,
  award_name TEXT NOT NULL,
  criteria TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  is_recommended BOOLEAN NOT NULL DEFAULT true,
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, member_id, award_key)
);

CREATE INDEX IF NOT EXISTS running_league_awards_league_idx
  ON public.running_league_awards (league_id, is_confirmed DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.running_league_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL UNIQUE REFERENCES public.running_league_participants(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.running_leagues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  rank INTEGER,
  total_score NUMERIC(6, 2),
  summary TEXT NOT NULL DEFAULT '',
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  coach_comment TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS running_league_reports_member_idx
  ON public.running_league_reports (member_id, league_id);

COMMENT ON TABLE public.running_league_goals IS '참가자 개인 목표 (주차별·대표 목표)';
COMMENT ON TABLE public.running_league_records IS '기록 측정 — 1km/3km/5km/10km, 월초·월말';
COMMENT ON TABLE public.running_league_mileage_logs IS '러닝 마일리지 일별/회별 로그';
COMMENT ON TABLE public.running_league_recovery_logs IS '회복관리 체크 로그';
COMMENT ON TABLE public.running_league_score_snapshots IS '점수 스냅샷 (주차별·최종)';
COMMENT ON TABLE public.running_league_awards IS '수상 부문·추천·확정';
COMMENT ON TABLE public.running_league_reports IS '회원별 리그 리포트';

-- ---------------------------------------------------------------------------
-- 3. updated_at 트리거
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_running_league_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'running_leagues',
    'running_league_participants',
    'running_league_goals',
    'running_league_records',
    'running_league_mileage_logs',
    'running_league_recovery_logs',
    'running_league_score_snapshots',
    'running_league_awards',
    'running_league_reports'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_running_league_updated_at()',
      tbl,
      tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. 기존 participants 데이터 → 보조 테이블 백필 (있을 때만)
-- ---------------------------------------------------------------------------

INSERT INTO public.running_league_goals (
  participant_id,
  league_id,
  member_id,
  goal_level,
  personal_goal,
  achievement_rate,
  goal_score,
  is_primary
)
SELECT
  p.id,
  p.league_id,
  p.member_id,
  p.goal_level,
  COALESCE(p.personal_goal, ''),
  p.goal_achievement_rate,
  p.goal_score,
  true
FROM public.running_league_participants p
WHERE (p.goal_level IS NOT NULL OR COALESCE(p.personal_goal, '') <> '')
  AND NOT EXISTS (
    SELECT 1
    FROM public.running_league_goals g
    WHERE g.participant_id = p.id
      AND g.is_primary = true
  );

INSERT INTO public.running_league_records (
  participant_id,
  league_id,
  member_id,
  distance_event,
  record_phase,
  time_text,
  measured_at
)
SELECT
  p.id,
  p.league_id,
  p.member_id,
  '5km',
  'month_start',
  p.record_baseline,
  l.starts_at
FROM public.running_league_participants p
JOIN public.running_leagues l ON l.id = p.league_id
WHERE COALESCE(p.record_baseline, '') <> ''
ON CONFLICT (participant_id, distance_event, record_phase) DO NOTHING;

INSERT INTO public.running_league_records (
  participant_id,
  league_id,
  member_id,
  distance_event,
  record_phase,
  time_text,
  measured_at
)
SELECT
  p.id,
  p.league_id,
  p.member_id,
  '5km',
  'month_end',
  p.record_current,
  l.ends_at
FROM public.running_league_participants p
JOIN public.running_leagues l ON l.id = p.league_id
WHERE COALESCE(p.record_current, '') <> ''
ON CONFLICT (participant_id, distance_event, record_phase) DO NOTHING;

INSERT INTO public.running_league_mileage_logs (
  participant_id,
  league_id,
  member_id,
  distance_km,
  logged_at,
  source,
  notes
)
SELECT
  p.id,
  p.league_id,
  p.member_id,
  p.mileage_km,
  l.ends_at,
  'import',
  'participants.mileage_km 백필'
FROM public.running_league_participants p
JOIN public.running_leagues l ON l.id = p.league_id
WHERE p.mileage_km > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.running_league_mileage_logs m
    WHERE m.participant_id = p.id
      AND m.source = 'import'
  );

UPDATE public.running_league_participants
SET coach_comment = notes
WHERE COALESCE(coach_comment, '') = ''
  AND COALESCE(notes, '') <> '';

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.running_league_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_mileage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_recovery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_league_reports ENABLE ROW LEVEL SECURITY;

-- admin: 전체
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'running_league_goals',
    'running_league_records',
    'running_league_mileage_logs',
    'running_league_recovery_logs',
    'running_league_score_snapshots',
    'running_league_awards',
    'running_league_reports'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_all ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_admin_all ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      tbl,
      tbl
    );
  END LOOP;
END $$;

-- member: 본인 데이터 읽기
CREATE OR REPLACE FUNCTION public.running_league_member_owns_row(target_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
  WHERE m.id = target_member_id
      AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.approval_status, 'approved') = 'approved'
  );
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'running_league_goals',
    'running_league_records',
    'running_league_mileage_logs',
    'running_league_recovery_logs',
    'running_league_score_snapshots'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_member_read ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_member_read ON public.%I FOR SELECT TO authenticated USING (public.running_league_member_owns_row(member_id))',
      tbl,
      tbl
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS running_league_awards_member_read ON public.running_league_awards;
CREATE POLICY running_league_awards_member_read ON public.running_league_awards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.running_leagues l
      WHERE l.id = running_league_awards.league_id
        AND l.status IN ('active', 'closed')
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.approval_status, 'approved') = 'approved'
    )
  );

DROP POLICY IF EXISTS running_league_reports_member_read ON public.running_league_reports;
CREATE POLICY running_league_reports_member_read ON public.running_league_reports
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND public.running_league_member_owns_row(member_id)
  );

NOTIFY pgrst, 'reload schema';
