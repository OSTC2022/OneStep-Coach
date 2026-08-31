-- 음료 선호 수동 입력 허용 — CHECK 제약 제거
-- (이미 add-member-drink-preference.sql 을 실행한 경우에도 실행하세요)

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_drink_preference_check;

COMMENT ON COLUMN public.members.drink_preference IS
  '음료 선호: water | bcaa_grape | bcaa_watermelon | bcaa_lemon | bcaa_mango | 기타 수동 입력 텍스트 | NULL';

NOTIFY pgrst, 'reload schema';
