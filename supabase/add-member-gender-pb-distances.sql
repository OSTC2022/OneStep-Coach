-- 회원 성별(랭킹 필터) + PB 거리 half/full 확장
-- Supabase SQL Editor에서 실행

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS gender TEXT;

ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_gender_check;
ALTER TABLE public.members
  ADD CONSTRAINT members_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

COMMENT ON COLUMN public.members.gender IS 'male | female — 성인 러닝 랭킹 성별 필터용';

ALTER TABLE public.running_league_records DROP CONSTRAINT IF EXISTS running_league_records_distance_event_check;
ALTER TABLE public.running_league_records
  ADD CONSTRAINT running_league_records_distance_event_check
  CHECK (distance_event IN ('1km', '3km', '5km', '10km', 'half', 'full'));

NOTIFY pgrst, 'reload schema';
