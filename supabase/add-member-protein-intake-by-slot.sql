-- 시간대별 단백질 섭취 (아침·점심·저녁·운동 전/후·간식)
-- supabase/add-member-protein-tracking.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS protein_intake_by_slot JSONB;

COMMENT ON COLUMN public.member_body_records.protein_intake_by_slot IS '시간대별 단백질 섭취(g) — breakfast/lunch/dinner/pre_workout/post_workout/snack';
