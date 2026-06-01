-- Member invite flow (email invitation via Supabase Auth Admin API)
-- Run in Supabase Dashboard > SQL Editor

-- Admin may update profiles when linking member login accounts
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Optional: track invited email on member record
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS invite_email TEXT;

COMMENT ON COLUMN public.members.invite_email IS
  'Last email used for member app login invitation';

-- ---------------------------------------------------------------------------
-- Supabase Dashboard checklist (manual, not SQL):
-- 1. Authentication > URL Configuration
--    Site URL: https://your-domain.com (or http://localhost:3000)
--    Redirect URLs:
--      - http://localhost:3000/auth/callback
--      - http://localhost:3000/auth/callback/hash
--      - http://localhost:3000/auth/confirm
--      - http://localhost:3000/auth/set-password
--      - (production URLs with same paths)
-- 2. Authentication > Email Templates > Invite user
--    Ensure invite emails are enabled
-- 3. Add SUPABASE_SERVICE_ROLE_KEY to server env (.env.local)
-- 4. Add NEXT_PUBLIC_SITE_URL to env
