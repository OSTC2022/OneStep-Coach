-- check_in_lesson 출석 권한 — 관리자·강사 허용 (자율배정 수업 포함)
-- "출석 체크 권한이 없습니다." 오류 시 실행

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'member'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
      AND lower(trim(coalesce(au.email, ''))) IN ('allakj@naver.com')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'coach'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('coach', 'instructor')
  );
$$;

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
  v_lesson RECORD;
  v_pkg RECORD;
  v_session_id UUID;
  v_new_remaining INTEGER;
  v_member_remaining INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', '로그인이 필요합니다.');
  END IF;

  IF NOT (public.is_admin() OR public.is_coach()) THEN
    RETURN jsonb_build_object('error', '출석 체크 권한이 없습니다.');
  END IF;

  SELECT l.* INTO v_lesson
  FROM public.lessons l
  WHERE l.id = p_lesson_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '수업을 찾을 수 없습니다.');
  END IF;

  IF v_lesson.member_id IS NULL THEN
    RETURN jsonb_build_object('error', '회원이 연결되지 않은 수업입니다.');
  END IF;

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

NOTIFY pgrst, 'reload schema';
