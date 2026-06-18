  -- 프로필 사진 · 연락처 · SNS (profiles)
  -- Supabase SQL Editor에서 실행

  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS kakao_id TEXT,
    ADD COLUMN IF NOT EXISTS instagram_id TEXT;

  COMMENT ON COLUMN public.profiles.avatar_url IS '프로필 사진 URL (storage avatars 버킷)';
  COMMENT ON COLUMN public.profiles.phone IS '연락처';
  COMMENT ON COLUMN public.profiles.kakao_id IS '카카오톡 아이디';
  COMMENT ON COLUMN public.profiles.instagram_id IS '인스타그램 아이디';

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'avatars',
    'avatars',
    true,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  )
  ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
  CREATE POLICY "avatars_public_read" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'avatars');

  DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
  CREATE POLICY "avatars_insert_own" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
  CREATE POLICY "avatars_update_own" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
  CREATE POLICY "avatars_delete_own" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  NOTIFY pgrst, 'reload schema';
