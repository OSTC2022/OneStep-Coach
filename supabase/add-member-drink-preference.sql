-- 회원 음료 선호 (수업현황 스케줄표에서 표기·수정)
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS drink_preference TEXT;

COMMENT ON COLUMN public.members.drink_preference IS
  '음료 선호: water | bcaa_grape | bcaa_watermelon | bcaa_lemon | bcaa_mango | 기타 수동 입력 텍스트 | NULL';

-- 수동 입력을 허용하므로 enum CHECK 는 두지 않습니다.
ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_drink_preference_check;

NOTIFY pgrst, 'reload schema';
