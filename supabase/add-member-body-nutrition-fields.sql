-- 신체 기록 — 회복 & 영양 체크 (nullable)
-- supabase/add-member-body-wellness-fields.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS protein_status TEXT,
  ADD COLUMN IF NOT EXISTS post_workout_meal_status TEXT,
  ADD COLUMN IF NOT EXISTS hydration_status TEXT,
  ADD COLUMN IF NOT EXISTS supplement_status JSONB,
  ADD COLUMN IF NOT EXISTS nutrition_note TEXT;

COMMENT ON COLUMN public.member_body_records.protein_status IS 'sufficient | normal | insufficient';
COMMENT ON COLUMN public.member_body_records.post_workout_meal_status IS 'done | normal | missed';
COMMENT ON COLUMN public.member_body_records.hydration_status IS 'sufficient | normal | insufficient';
COMMENT ON COLUMN public.member_body_records.supplement_status IS '선수별 영양제 복용 상태 jsonb';
COMMENT ON COLUMN public.member_body_records.nutrition_note IS '회복·영양 메모 (선택)';
