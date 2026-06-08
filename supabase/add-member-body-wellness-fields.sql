-- 신체 기록 — 수면·컨디션·피로 등 선택 입력 (버튼 값)
-- supabase/add-member-body-records.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS sleep_hours TEXT,
  ADD COLUMN IF NOT EXISTS condition TEXT,
  ADD COLUMN IF NOT EXISTS fatigue TEXT,
  ADD COLUMN IF NOT EXISTS muscle_soreness TEXT,
  ADD COLUMN IF NOT EXISTS pain_area TEXT,
  ADD COLUMN IF NOT EXISTS meal_status TEXT;

COMMENT ON COLUMN public.member_body_records.sleep_hours IS 'under_6 | 6_7 | 7_8 | over_8';
COMMENT ON COLUMN public.member_body_records.condition IS 'good | normal | bad';
COMMENT ON COLUMN public.member_body_records.fatigue IS 'low | normal | high';
COMMENT ON COLUMN public.member_body_records.muscle_soreness IS 'none | mild | severe';
COMMENT ON COLUMN public.member_body_records.pain_area IS 'none | knee | shoulder | back | ankle | other';
COMMENT ON COLUMN public.member_body_records.meal_status IS 'good | normal | poor';
