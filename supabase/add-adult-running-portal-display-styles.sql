-- 성인 러닝 포털 헤더·랭킹 한줄 문구 표시 스타일 (JSON)
ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_header_style JSONB;

ALTER TABLE public.center_settings
  ADD COLUMN IF NOT EXISTS adult_running_portal_ranking_caption_style JSONB;

COMMENT ON COLUMN public.center_settings.adult_running_portal_header_style IS '성인 러닝 포털 상단 헤더 스타일 (색상·폰트·정렬)';
COMMENT ON COLUMN public.center_settings.adult_running_portal_ranking_caption_style IS '랭킹 한줄 문구 스타일 (색상·폰트·정렬)';
