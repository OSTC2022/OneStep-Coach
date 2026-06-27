-- 독립 출석 기록 (Google sync / 반복 exception 삭제와 무관하게 유지)
-- Supabase SQL Editor에서 실행하세요.

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id TEXT NOT NULL DEFAULT 'default',
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  lesson_occurrence_key TEXT NOT NULL,
  lesson_date DATE NOT NULL,
  start_time TIME,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  recurring_master_id UUID,
  google_recurring_event_id TEXT,
  original_start_time TIMESTAMPTZ,
  instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'cancelled', 'absent', 'makeup')),
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_unique_occurrence
    UNIQUE (center_id, member_id, lesson_occurrence_key)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_member_date
  ON public.attendance_records (member_id, lesson_date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_lesson_date
  ON public.attendance_records (lesson_date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_occurrence_key
  ON public.attendance_records (lesson_occurrence_key);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_records_staff_all ON public.attendance_records;
CREATE POLICY attendance_records_staff_all ON public.attendance_records
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
