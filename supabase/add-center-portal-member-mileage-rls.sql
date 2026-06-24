-- 센터 메인 랭킹: 회원이 리그 참가·마일리지·PB를 직접 등록할 수 있게 합니다.
-- add-center-portal-ranking-league.sql 과 함께 실행하세요.

CREATE OR REPLACE FUNCTION public.is_center_portal_ranking_league(target_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.running_leagues l
    WHERE l.id = target_league_id
      AND (
        l.description LIKE '%__center_portal_ranking__%'
        OR l.title = 'ONE STEP RUNNING RANKING'
      )
  );
$$;

-- 메인 랭킹 리그 (없으면 생성)
INSERT INTO public.running_leagues (
  title,
  description,
  starts_at,
  ends_at,
  status
)
SELECT
  'ONE STEP RUNNING RANKING',
  '__center_portal_ranking__ 센터 메인 랭킹 (이벤트 시즌과 별도)',
  date_trunc('year', CURRENT_DATE)::date,
  '2099-12-31'::date,
  'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.running_leagues
  WHERE description LIKE '%__center_portal_ranking__%'
     OR title = 'ONE STEP RUNNING RANKING'
);

DROP POLICY IF EXISTS running_league_participants_portal_self_insert ON public.running_league_participants;
CREATE POLICY running_league_participants_portal_self_insert ON public.running_league_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.running_league_member_owns_row(member_id)
    AND public.is_center_portal_ranking_league(league_id)
  );

DROP POLICY IF EXISTS running_league_participants_portal_self_update ON public.running_league_participants;
CREATE POLICY running_league_participants_portal_self_update ON public.running_league_participants
  FOR UPDATE TO authenticated
  USING (
    public.running_league_member_owns_row(member_id)
    AND public.is_center_portal_ranking_league(league_id)
  )
  WITH CHECK (
    public.running_league_member_owns_row(member_id)
    AND public.is_center_portal_ranking_league(league_id)
  );

DROP POLICY IF EXISTS running_league_mileage_logs_member_write ON public.running_league_mileage_logs;
CREATE POLICY running_league_mileage_logs_member_write ON public.running_league_mileage_logs
  FOR ALL TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

DROP POLICY IF EXISTS running_league_records_member_write ON public.running_league_records;
CREATE POLICY running_league_records_member_write ON public.running_league_records
  FOR ALL TO authenticated
  USING (public.running_league_member_owns_row(member_id))
  WITH CHECK (public.running_league_member_owns_row(member_id));

NOTIFY pgrst, 'reload schema';
