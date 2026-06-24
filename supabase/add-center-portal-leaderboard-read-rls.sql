-- 센터 메인 랭킹: 성인 회원이 서로의 PB·마일리지·이름을 랭킹/그래프용으로 조회
-- add-center-portal-member-mileage-rls.sql 실행 후 적용하세요.

CREATE OR REPLACE FUNCTION public.is_approved_portal_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.approval_status, 'approved') = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_center_portal_ranking_participant(target_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.running_league_participants p
    WHERE p.member_id = target_member_id
      AND public.is_center_portal_ranking_league(p.league_id)
  );
$$;

DROP POLICY IF EXISTS running_league_records_portal_leaderboard_read ON public.running_league_records;
CREATE POLICY running_league_records_portal_leaderboard_read ON public.running_league_records
  FOR SELECT TO authenticated
  USING (
    public.is_center_portal_ranking_league(league_id)
    AND public.is_approved_portal_member()
  );

DROP POLICY IF EXISTS running_league_mileage_logs_portal_leaderboard_read ON public.running_league_mileage_logs;
CREATE POLICY running_league_mileage_logs_portal_leaderboard_read ON public.running_league_mileage_logs
  FOR SELECT TO authenticated
  USING (
    public.is_center_portal_ranking_league(league_id)
    AND public.is_approved_portal_member()
  );

DROP POLICY IF EXISTS members_portal_ranking_leaderboard_read ON public.members;
CREATE POLICY members_portal_ranking_leaderboard_read ON public.members
  FOR SELECT TO authenticated
  USING (
    public.is_approved_portal_member()
    AND public.is_center_portal_ranking_participant(id)
  );

DROP POLICY IF EXISTS profiles_portal_ranking_role_read ON public.profiles;
CREATE POLICY profiles_portal_ranking_role_read ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_approved_portal_member()
    AND EXISTS (
      SELECT 1
      FROM public.members m
      WHERE (m.auth_user_id = profiles.id OR m.user_id = profiles.id)
        AND public.is_center_portal_ranking_participant(m.id)
    )
  );

NOTIFY pgrst, 'reload schema';
