-- 회원 로그인 계정 연결 필드
-- supabase/add-auth-roles-mvp.sql, member-invite-flow.sql 실행 후 적용

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS member_login_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS member_invite_code TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

COMMENT ON COLUMN public.members.member_login_enabled IS '회원/보호자 앱 로그인 활성화 여부';
COMMENT ON COLUMN public.members.member_invite_code IS '초대·연결 시 발급 코드 (선택)';
COMMENT ON COLUMN public.members.last_login_at IS '회원 계정 마지막 로그인 시각';

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_member_invite_code
  ON public.members (member_invite_code)
  WHERE member_invite_code IS NOT NULL;
