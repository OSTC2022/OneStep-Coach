-- 성인 러닝 포털 문구·공지 (center_settings)
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_league_label TEXT;

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_title TEXT;

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_notice TEXT;

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_ranking_reference_date DATE;

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_ranking_caption TEXT;

COMMENT ON COLUMN public.center_settings.adult_running_portal_league_label IS '성인 러닝 포털 상단 리그 문구 (예: ONE STEP RUNNING LEAGUE)';
COMMENT ON COLUMN public.center_settings.adult_running_portal_title IS '성인 러닝 포털 메인 제목 (예: 내 러닝 포털)';
COMMENT ON COLUMN public.center_settings.adult_running_portal_notice IS '성인 러닝 포털 공지사항 (접이식)';
COMMENT ON COLUMN public.center_settings.adult_running_portal_ranking_reference_date IS '랭킹 기본 기준일 (미지정 시 매월 자동·당월)';
COMMENT ON COLUMN public.center_settings.adult_running_portal_ranking_caption IS '랭킹 헤더 우측 한줄 문구';
