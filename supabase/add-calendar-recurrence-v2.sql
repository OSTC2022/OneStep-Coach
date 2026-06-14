-- Calendar recurrence v2: recurring master + exception model (Google Calendar / Apple Calendar style)
-- Run in Supabase SQL Editor after add-lesson-recurrence.sql and add-google-calendar-sync.sql

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'single'
    CHECK (event_type IN ('single', 'recurring_master', 'exception', 'materialized')),
  ADD COLUMN IF NOT EXISTS recurrence TEXT[],
  ADD COLUMN IF NOT EXISTS recurring_master_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS google_ical_uid TEXT,
  ADD COLUMN IF NOT EXISTS google_recurring_event_id TEXT,
  ADD COLUMN IF NOT EXISTS original_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_timezone TEXT,
  ADD COLUMN IF NOT EXISTS event_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (event_status IN ('confirmed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_lessons_event_type ON public.lessons (event_type);
CREATE INDEX IF NOT EXISTS idx_lessons_recurring_master_id ON public.lessons (recurring_master_id);
CREATE INDEX IF NOT EXISTS idx_lessons_recurring_master_range ON public.lessons (event_type, lesson_date)
  WHERE event_type = 'recurring_master';
CREATE INDEX IF NOT EXISTS idx_lessons_google_recurring_event_id
  ON public.lessons (google_recurring_event_id)
  WHERE google_recurring_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_google_recurring_instance
  ON public.lessons (google_recurring_event_id, original_start_time)
  WHERE google_recurring_event_id IS NOT NULL
    AND original_start_time IS NOT NULL
    AND event_type = 'exception';

-- Legacy materialized rows (recurrence_group_id set, multiple rows per series)
UPDATE public.lessons
SET event_type = 'materialized'
WHERE event_type = 'single'
  AND recurrence_group_id IS NOT NULL
  AND recurrence_pattern IS NOT NULL
  AND google_event_id IS NULL;

-- Google-synced instance rows → keep as materialized until next sync consolidates to master
UPDATE public.lessons
SET event_type = 'materialized'
WHERE event_type = 'single'
  AND google_event_id IS NOT NULL
  AND recurrence_group_id IS NOT NULL;

COMMENT ON COLUMN public.lessons.event_type IS 'single | recurring_master | exception | materialized(legacy)';
COMMENT ON COLUMN public.lessons.recurrence IS 'RRULE/EXDATE/RDATE lines for recurring_master';
COMMENT ON COLUMN public.lessons.recurring_master_id IS 'Parent master for exception rows';
COMMENT ON COLUMN public.lessons.original_start_time IS 'Original occurrence start for Google/app exceptions';
