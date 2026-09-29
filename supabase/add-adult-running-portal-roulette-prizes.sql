-- 행운의 룰렛 메뉴별 경품 (마일리지왕 / 출석왕)
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_roulette_prizes JSONB;

COMMENT ON COLUMN public.center_settings.adult_running_portal_roulette_prizes IS
  '행운의 룰렛 경품 { "mileage": string, "beat_rival": string, "attendance": string }';
