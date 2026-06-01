-- Fix public.users role constraint violations (e.g. role = 'members')
-- Run in Supabase SQL Editor

-- 1) Normalize legacy role values for public.users CHECK constraint
CREATE OR REPLACE FUNCTION public.normalize_users_table_role(p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_role TEXT := lower(trim(COALESCE(p_role, 'member')));
BEGIN
  IF v_role IN ('member', 'members') THEN
    RETURN 'member';
  END IF;
  IF v_role IN ('instructor', 'coach') THEN
    RETURN 'instructor';
  END IF;
  IF v_role = 'admin' THEN
    RETURN 'admin';
  END IF;
  IF v_role = 'guardian' THEN
    RETURN 'member';
  END IF;
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
  IF v_role = 'instructor' THEN
    RETURN 'coach';
  END IF;
  IF v_role IN ('member', 'members') THEN
    RETURN 'member';
  END IF;
  IF v_role IN ('admin', 'coach', 'member', 'guardian') THEN
    RETURN v_role;
  END IF;
  RETURN 'member';
END;
$$;

-- 2) Auth trigger: profiles + legacy public.users (mapped roles)
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
  v_profile_role := public.normalize_profile_role(NEW.raw_user_meta_data->>'role');
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
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) Repair bad rows already inserted
UPDATE public.users
SET role = public.normalize_users_table_role(role)
WHERE role IS DISTINCT FROM public.normalize_users_table_role(role);

UPDATE public.profiles
SET role = public.normalize_profile_role(role)
WHERE role IS DISTINCT FROM public.normalize_profile_role(role);

-- 4) Optional: store last invited email on member record
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS invite_email TEXT;
