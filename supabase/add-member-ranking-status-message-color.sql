-- 러닝 포털 상태 메시지 색상 + 참가 회원 간 조회
-- add-member-ranking-status-message.sql, add-center-portal-leaderboard-read-rls.sql 실행 후 적용

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS ranking_status_message_color TEXT;

COMMENT ON COLUMN public.members.ranking_status_message IS
  '러닝 포털 랭킹 이름 옆 상태 메시지 (최대 15자, 본인만 수정, 참가 회원 전체 공개)';

COMMENT ON COLUMN public.members.ranking_status_message_color IS
  '러닝 포털 상태 메시지 글자색 (HEX, 본인만 수정, 참가 회원 전체 공개)';

-- 승인된 포털 회원이 센터 랭킹 참가자의 프로필(상태 메시지 포함)을 조회
DROP POLICY IF EXISTS members_portal_ranking_leaderboard_read ON public.members;
CREATE POLICY members_portal_ranking_leaderboard_read ON public.members
  FOR SELECT TO authenticated
  USING (
    public.is_approved_portal_member()
    AND public.is_center_portal_ranking_participant(id)
  );

NOTIFY pgrst, 'reload schema';
