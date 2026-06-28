-- 로그인 화면 신규 가입 회원 24시간 '신규' 라벨 (관리자·강사용)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS new_member_badge_until TIMESTAMPTZ;

COMMENT ON COLUMN public.members.new_member_badge_until IS '로그인 가입 신규 회원 표시 종료 시각 (가입 후 24시간)';
