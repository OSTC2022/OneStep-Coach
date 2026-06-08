-- 단백질 목표·섭취 자동 계산 (nullable)
-- supabase/add-member-body-nutrition-fields.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS protein_target_g NUMERIC,
  ADD COLUMN IF NOT EXISTS protein_intake_g NUMERIC,
  ADD COLUMN IF NOT EXISTS protein_goal_multiplier NUMERIC;

COMMENT ON COLUMN public.member_body_records.protein_target_g IS '기록 당시 하루 단백질 목표(g)';
COMMENT ON COLUMN public.member_body_records.protein_intake_g IS '오늘 단백질 섭취량(g)';
COMMENT ON COLUMN public.member_body_records.protein_goal_multiplier IS '기록 당시 체중×계수';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS protein_goal_multiplier NUMERIC DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS protein_goal_mode TEXT DEFAULT 'training';

COMMENT ON COLUMN public.members.protein_goal_multiplier IS '단백질 목표 계수 (기본 1.5)';
COMMENT ON COLUMN public.members.protein_goal_mode IS 'basic | training | high_intensity | recovery';
