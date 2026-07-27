-- 신체 기록 — 최대 시속 (강사/관리자 전용, 회원 포털 비노출)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.member_body_records
  ADD COLUMN IF NOT EXISTS max_speed_kmh NUMERIC;

COMMENT ON COLUMN public.member_body_records.max_speed_kmh IS
  '최대 시속(km/h) — 수업현황·서명 창 전용, 회원/보호자 포털 비노출';
