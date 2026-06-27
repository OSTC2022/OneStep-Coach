-- Google Calendar → 앱 강사/색상 매핑 (Supabase 원본 정책)
-- Supabase SQL Editor에서 실행하세요.

CREATE TABLE IF NOT EXISTS public.google_calendar_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id TEXT NOT NULL DEFAULT 'default',
  google_calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  default_coach_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  display_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT google_calendar_mappings_unique
    UNIQUE (center_id, google_calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_mappings_calendar_id
  ON public.google_calendar_mappings (google_calendar_id);

-- Google 미러 메타 (앱 일정 본문과 분리)
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS google_external_title TEXT,
  ADD COLUMN IF NOT EXISTS google_external_start_time TIMESTAMPTZ;

-- 기본 매핑 시드 (이름 기준 — google_calendar_id는 연결 후 settings에서 갱신)
INSERT INTO public.google_calendar_mappings (center_id, google_calendar_id, calendar_name, display_color)
SELECT 'default', 'pending:수업', '수업', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.google_calendar_mappings WHERE calendar_name = '수업' AND center_id = 'default'
);

INSERT INTO public.google_calendar_mappings (center_id, google_calendar_id, calendar_name, display_color)
SELECT 'default', 'pending:수업1', '수업1', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.google_calendar_mappings WHERE calendar_name = '수업1' AND center_id = 'default'
);

INSERT INTO public.google_calendar_mappings (center_id, google_calendar_id, calendar_name, display_color)
SELECT 'default', 'pending:수업2', '수업2', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.google_calendar_mappings WHERE calendar_name = '수업2' AND center_id = 'default'
);

-- 강사 이름으로 default_coach_id 백필 (있을 때만)
UPDATE public.google_calendar_mappings m
SET default_coach_id = i.id, updated_at = now()
FROM public.instructors i
WHERE m.default_coach_id IS NULL
  AND m.calendar_name IN ('수업', '수업1')
  AND i.name = '이교직'
  AND i.is_active = true;

UPDATE public.google_calendar_mappings m
SET default_coach_id = i.id, updated_at = now()
FROM public.instructors i
WHERE m.default_coach_id IS NULL
  AND m.calendar_name = '수업2'
  AND i.name = '장지용'
  AND i.is_active = true;

ALTER TABLE public.google_calendar_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_calendar_mappings_staff_all ON public.google_calendar_mappings;
CREATE POLICY google_calendar_mappings_staff_all ON public.google_calendar_mappings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'coach')
        AND p.approval_status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'coach')
        AND p.approval_status = 'approved'
    )
  );
