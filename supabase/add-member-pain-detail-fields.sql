-- 통증 부위 상세 — 통증 정도(1~10) · 기타 부위 직접 입력
-- supabase/add-member-body-wellness-fields.sql 실행 후 적용

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS pain_level SMALLINT,
  ADD COLUMN IF NOT EXISTS pain_area_note TEXT;

COMMENT ON COLUMN public.member_body_records.pain_level IS '통증 정도 1~10 (없음 제외 부위 선택 시)';
COMMENT ON COLUMN public.member_body_records.pain_area_note IS '통증 부위 기타(other) 직접 입력';
