-- OneStep Coach 성능 인덱스 (Supabase SQL Editor에서 전체 선택 후 Run)
-- 일부 컬럼이 없으면 해당 인덱스만 건너뜁니다.

-- ── 선택: 가입 승인 컬럼 (알림·승인 대기용) ──
-- approval_status 인덱스가 필요하면 아래 주석 해제 후 먼저 실행하거나
-- supabase/add-profile-approval.sql 을 실행하세요.
--
-- ALTER TABLE public.profiles
--   ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
--     CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- 회원
CREATE INDEX IF NOT EXISTS idx_members_is_active_created_at
  ON public.members (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_members_name
  ON public.members (name);

CREATE INDEX IF NOT EXISTS idx_members_primary_instructor_id
  ON public.members (primary_instructor_id)
  WHERE primary_instructor_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'deleted_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_members_deleted_at
      ON public.members (deleted_at)
      WHERE deleted_at IS NULL;
  ELSE
    RAISE NOTICE 'members.deleted_at 없음 — add-members-deleted-at.sql 실행 후 인덱스 생성 가능';
  END IF;
END $$;

-- 수업권
CREATE INDEX IF NOT EXISTS idx_session_packages_member_id_created_at
  ON public.session_packages (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_packages_active_remaining
  ON public.session_packages (is_active, remaining_sessions)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_session_packages_paid_at
  ON public.session_packages (paid_at)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_packages_expires_at
  ON public.session_packages (expires_at)
  WHERE expires_at IS NOT NULL;

-- 수업
CREATE INDEX IF NOT EXISTS idx_lessons_lesson_date_start_time
  ON public.lessons (lesson_date, start_time);

CREATE INDEX IF NOT EXISTS idx_lessons_member_id_lesson_date
  ON public.lessons (member_id, lesson_date DESC)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_instructor_id_lesson_date
  ON public.lessons (instructor_id, lesson_date)
  WHERE instructor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_session_package_id
  ON public.lessons (session_package_id)
  WHERE session_package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_created_at
  ON public.lessons (created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'recurrence_group_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_lessons_recurrence_group_id
      ON public.lessons (recurrence_group_id)
      WHERE recurrence_group_id IS NOT NULL;
  ELSE
    RAISE NOTICE 'lessons.recurrence_group_id 없음 — fix-lessons-recurrence-delete.sql 실행 후 인덱스 생성 가능';
  END IF;
END $$;

-- 강사
CREATE INDEX IF NOT EXISTS idx_instructors_is_active_name
  ON public.instructors (is_active, name);

CREATE INDEX IF NOT EXISTS idx_instructors_user_id
  ON public.instructors (user_id)
  WHERE user_id IS NOT NULL;

-- 프로필 (가입 승인 알림)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'approval_status'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_profiles_approval_status_created_at
      ON public.profiles (approval_status, created_at DESC);
  ELSE
    RAISE NOTICE 'profiles.approval_status 없음 — supabase/add-profile-approval.sql 실행 후 다시 Run';
  END IF;
END $$;

-- 선택: 월 매출 합계용 (대시보드)
-- CREATE OR REPLACE FUNCTION public.sum_session_revenue_since(p_start date)
-- RETURNS numeric LANGUAGE sql STABLE AS $$
--   SELECT COALESCE(SUM(price), 0) FROM public.session_packages
--   WHERE paid_at >= p_start AND price IS NOT NULL;
-- $$;
