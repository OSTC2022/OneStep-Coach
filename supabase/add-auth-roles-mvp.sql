-- OneStep Coach: Auth / Roles / Sessions MVP
-- Run in Supabase Dashboard > SQL Editor (after schema.sql)
-- Does NOT drop existing tables — ALTER + CREATE only.

-- ---------------------------------------------------------------------------
-- 1. profiles (auth.users linked)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'coach', 'member', 'guardian')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.normalize_users_table_role(p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_role TEXT := lower(trim(COALESCE(p_role, 'member')));
BEGIN
  IF v_role IN ('member', 'members') THEN RETURN 'member'; END IF;
  IF v_role IN ('instructor', 'coach') THEN RETURN 'instructor'; END IF;
  IF v_role = 'admin' THEN RETURN 'admin'; END IF;
  IF v_role = 'guardian' THEN RETURN 'member'; END IF;
  RETURN 'member';
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_profile_role(p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_role TEXT := lower(trim(COALESCE(p_role, 'member')));
BEGIN
  IF v_role = 'instructor' THEN RETURN 'coach'; END IF;
  IF v_role IN ('member', 'members') THEN RETURN 'member'; END IF;
  IF v_role IN ('admin', 'coach', 'member', 'guardian') THEN RETURN v_role; END IF;
  RETURN 'member';
END;
$$;

-- Migrate legacy public.users → profiles (instructor → coach)
INSERT INTO public.profiles (id, email, full_name, role, created_at)
SELECT
  u.id,
  u.email,
  u.full_name,
  CASE
    WHEN u.role = 'instructor' THEN 'coach'
    WHEN u.role IN ('admin', 'coach', 'member', 'guardian') THEN u.role
    ELSE 'member'
  END,
  u.created_at
FROM public.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
  role = EXCLUDED.role;

-- Keep legacy public.users rows in sync (FK from instructors/members still reference users)
INSERT INTO public.users (id, email, full_name, role)
SELECT
  p.id,
  p.email,
  p.full_name,
  public.normalize_users_table_role(p.role)
FROM public.profiles p
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- 2. members: auth link + remaining_sessions cache
-- ---------------------------------------------------------------------------
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS remaining_sessions INTEGER NOT NULL DEFAULT 0;

-- Sync auth_user_id from legacy user_id
UPDATE public.members
SET auth_user_id = user_id
WHERE auth_user_id IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_auth_user_id ON public.members(auth_user_id);

-- Cache remaining_sessions from active packages
CREATE OR REPLACE FUNCTION public.sync_member_remaining_sessions(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.members m
  SET remaining_sessions = COALESCE((
    SELECT SUM(sp.remaining_sessions)::INTEGER
    FROM public.session_packages sp
    WHERE sp.member_id = p_member_id
      AND sp.is_active = TRUE
      AND sp.remaining_sessions > 0
  ), 0)
  WHERE m.id = p_member_id;
END;
$$;

-- Initial sync for all members
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.members LOOP
    PERFORM public.sync_member_remaining_sessions(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. lesson_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  session_package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'present', 'absent', 'makeup', 'cancelled')),
  notes TEXT,
  signature_url TEXT,
  signature_data TEXT,
  session_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_sessions_member ON public.lesson_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_lesson ON public.lesson_sessions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_date ON public.lesson_sessions(session_date);

-- ---------------------------------------------------------------------------
-- 4. session_transactions (+/- audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  session_package_id UUID REFERENCES public.session_packages(id) ON DELETE SET NULL,
  lesson_session_id UUID REFERENCES public.lesson_sessions(id) ON DELETE SET NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_transactions_member ON public.session_transactions(member_id);

-- ---------------------------------------------------------------------------
-- 5. RLS helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.members
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_instructor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.instructors
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_profile_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_profile_role() = 'coach';
$$;

-- ---------------------------------------------------------------------------
-- 6. Check-in RPC (attendance + deduct + transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_in_lesson(
  p_lesson_id UUID,
  p_status TEXT DEFAULT 'present',
  p_signature_data TEXT DEFAULT NULL,
  p_signature_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_lesson RECORD;
  v_pkg RECORD;
  v_session_id UUID;
  v_new_remaining INTEGER;
  v_member_remaining INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', '로그인이 필요합니다.');
  END IF;

  v_role := public.current_profile_role();
  IF v_role NOT IN ('admin', 'coach') THEN
    RETURN jsonb_build_object('error', '출석 체크 권한이 없습니다.');
  END IF;

  SELECT l.* INTO v_lesson
  FROM public.lessons l
  WHERE l.id = p_lesson_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '수업을 찾을 수 없습니다.');
  END IF;

  IF v_role = 'coach' THEN
    IF v_lesson.instructor_id IS DISTINCT FROM public.current_instructor_id() THEN
      RETURN jsonb_build_object('error', '담당 수업만 출석 처리할 수 있습니다.');
    END IF;
  END IF;

  IF v_lesson.member_id IS NULL THEN
    RETURN jsonb_build_object('error', '회원이 연결되지 않은 수업입니다.');
  END IF;

  -- Upsert lesson_sessions
  SELECT id INTO v_session_id
  FROM public.lesson_sessions
  WHERE lesson_id = p_lesson_id
  LIMIT 1;

  IF v_session_id IS NULL THEN
    INSERT INTO public.lesson_sessions (
      lesson_id, member_id, instructor_id, session_package_id,
      session_date, checked_in_at, checked_in_by, status,
      notes, signature_data, signature_url
    ) VALUES (
      p_lesson_id, v_lesson.member_id, v_lesson.instructor_id, v_lesson.session_package_id,
      v_lesson.lesson_date, NOW(), v_user_id, p_status,
      p_notes, p_signature_data, p_signature_url
    )
    RETURNING id INTO v_session_id;
  ELSE
    UPDATE public.lesson_sessions SET
      status = p_status,
      checked_in_at = NOW(),
      checked_in_by = v_user_id,
      notes = COALESCE(p_notes, notes),
      signature_data = COALESCE(p_signature_data, signature_data),
      signature_url = COALESCE(p_signature_url, signature_url),
      updated_at = NOW()
    WHERE id = v_session_id;
  END IF;

  -- Deduct session on present (once)
  IF p_status = 'present' AND NOT COALESCE(v_lesson.session_deducted, FALSE) THEN
    IF v_lesson.session_package_id IS NOT NULL THEN
      SELECT * INTO v_pkg
      FROM public.session_packages
      WHERE id = v_lesson.session_package_id
      FOR UPDATE;

      IF v_pkg.remaining_sessions <= 0 THEN
        RETURN jsonb_build_object('error', '남은 수업 횟수가 없습니다.');
      END IF;

      v_new_remaining := v_pkg.remaining_sessions - 1;

      UPDATE public.session_packages
      SET remaining_sessions = v_new_remaining,
          is_active = v_new_remaining > 0
      WHERE id = v_pkg.id;

      INSERT INTO public.session_transactions (
        member_id, session_package_id, lesson_session_id,
        delta, balance_after, reason, created_by
      ) VALUES (
        v_lesson.member_id, v_pkg.id, v_session_id,
        -1, v_new_remaining, 'lesson_check_in', v_user_id
      );

      UPDATE public.lesson_sessions
      SET session_deducted = TRUE
      WHERE id = v_session_id;

      PERFORM public.sync_member_remaining_sessions(v_lesson.member_id);
    END IF;

    UPDATE public.lessons
    SET attendance_status = p_status,
        session_deducted = TRUE
    WHERE id = p_lesson_id;
  ELSE
    UPDATE public.lessons
    SET attendance_status = p_status
    WHERE id = p_lesson_id;
  END IF;

  SELECT remaining_sessions INTO v_member_remaining
  FROM public.members WHERE id = v_lesson.member_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'lesson_session_id', v_session_id,
    'member_remaining_sessions', v_member_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_lesson TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_member_remaining_sessions TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Auth trigger → profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_role TEXT;
  v_users_role TEXT;
BEGIN
  v_profile_role := public.normalize_profile_role(
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  );
  v_users_role := public.normalize_users_table_role(v_profile_role);

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_profile_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = EXCLUDED.role;

  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_users_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_transactions ENABLE ROW LEVEL SECURITY;

-- Drop permissive policies (if re-running)
DROP POLICY IF EXISTS "Authenticated users can read users" ON public.users;
DROP POLICY IF EXISTS "Authenticated users full access members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users full access lessons" ON public.lessons;
DROP POLICY IF EXISTS "Authenticated users full access session_packages" ON public.session_packages;
DROP POLICY IF EXISTS "Authenticated users full access instructors" ON public.instructors;

-- profiles
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- members
DROP POLICY IF EXISTS "members_admin_all" ON public.members;
CREATE POLICY "members_admin_all" ON public.members
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "members_coach_assigned" ON public.members;
CREATE POLICY "members_coach_assigned" ON public.members
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND primary_instructor_id = public.current_instructor_id()
  );

DROP POLICY IF EXISTS "members_self_read" ON public.members;
CREATE POLICY "members_self_read" ON public.members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- lessons
DROP POLICY IF EXISTS "lessons_admin_all" ON public.lessons;
CREATE POLICY "lessons_admin_all" ON public.lessons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lessons_coach_own" ON public.lessons;
CREATE POLICY "lessons_coach_own" ON public.lessons
  FOR ALL TO authenticated
  USING (
    public.is_coach()
    AND instructor_id = public.current_instructor_id()
  )
  WITH CHECK (
    public.is_coach()
    AND instructor_id = public.current_instructor_id()
  );

DROP POLICY IF EXISTS "lessons_member_own" ON public.lessons;
CREATE POLICY "lessons_member_own" ON public.lessons
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

-- session_packages
DROP POLICY IF EXISTS "packages_admin_all" ON public.session_packages;
CREATE POLICY "packages_admin_all" ON public.session_packages
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "packages_member_read" ON public.session_packages;
CREATE POLICY "packages_member_read" ON public.session_packages
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

DROP POLICY IF EXISTS "packages_coach_read" ON public.session_packages;
CREATE POLICY "packages_coach_read" ON public.session_packages
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND member_id IN (
      SELECT id FROM public.members
      WHERE primary_instructor_id = public.current_instructor_id()
    )
  );

-- lesson_sessions
DROP POLICY IF EXISTS "lesson_sessions_admin" ON public.lesson_sessions;
CREATE POLICY "lesson_sessions_admin" ON public.lesson_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lesson_sessions_coach" ON public.lesson_sessions;
CREATE POLICY "lesson_sessions_coach" ON public.lesson_sessions
  FOR ALL TO authenticated
  USING (
    public.is_coach()
    AND instructor_id = public.current_instructor_id()
  )
  WITH CHECK (
    public.is_coach()
    AND instructor_id = public.current_instructor_id()
  );

DROP POLICY IF EXISTS "lesson_sessions_member_read" ON public.lesson_sessions;
CREATE POLICY "lesson_sessions_member_read" ON public.lesson_sessions
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

-- session_transactions
DROP POLICY IF EXISTS "session_tx_admin" ON public.session_transactions;
CREATE POLICY "session_tx_admin" ON public.session_transactions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "session_tx_member_read" ON public.session_transactions;
CREATE POLICY "session_tx_member_read" ON public.session_transactions
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id());

DROP POLICY IF EXISTS "session_tx_coach_read" ON public.session_transactions;
CREATE POLICY "session_tx_coach_read" ON public.session_transactions
  FOR SELECT TO authenticated
  USING (
    public.is_coach()
    AND member_id IN (
      SELECT id FROM public.members
      WHERE primary_instructor_id = public.current_instructor_id()
    )
  );

-- instructors: admin full, coach read self, members read own primary
DROP POLICY IF EXISTS "instructors_admin" ON public.instructors;
CREATE POLICY "instructors_admin" ON public.instructors
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "instructors_coach_self" ON public.instructors;
CREATE POLICY "instructors_coach_self" ON public.instructors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "instructors_member_read" ON public.instructors;
CREATE POLICY "instructors_member_read" ON public.instructors
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT primary_instructor_id FROM public.members
      WHERE auth_user_id = auth.uid()
    )
  );
