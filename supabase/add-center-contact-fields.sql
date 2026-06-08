-- 센터 연락·위치 정보 (회원 마이페이지 "코치 & 센터 연락")

ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS center_phone TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS naver_place_url TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS center_address TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS business_hours TEXT;
ALTER TABLE public.center_settings ADD COLUMN IF NOT EXISTS show_instructor_contact BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.center_settings.center_phone IS '센터 대표 전화 (회원 포털 tel: 링크)';
COMMENT ON COLUMN public.center_settings.naver_place_url IS '네이버 플레이스 URL';
COMMENT ON COLUMN public.center_settings.center_address IS '센터 주소 (표시용)';
COMMENT ON COLUMN public.center_settings.business_hours IS '운영 시간 (표시용)';
COMMENT ON COLUMN public.center_settings.show_instructor_contact IS '회원 포털에 담당 코치 전화 노출 여부';

NOTIFY pgrst, 'reload schema';
