-- 행운의 룰렛 월별·메뉴별 경품 (마일리지왕 / 이겨라 / 출석왕)
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_roulette_prizes JSONB;

COMMENT ON COLUMN public.center_settings.adult_running_portal_roulette_prizes IS
  '행운의 룰렛 월별 경품 { "yyyy-MM": { "mileage": string, "beat_rival": string, "attendance": string }, ... }. 구형 단일 객체도 읽기 호환.';