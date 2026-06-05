-- 서명(signatures) 테이블 — 수업 종료 시 서명 저장
-- Supabase SQL Editor에서 전체 선택 후 Run

CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- lessons.signature_id 컬럼 (없으면 추가)
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS signature_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_signature_id_fkey'
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_signature_id_fkey
      FOREIGN KEY (signature_id) REFERENCES public.signatures(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.signatures
  DROP CONSTRAINT IF EXISTS signatures_lesson_id_fkey;
ALTER TABLE public.signatures
  ADD CONSTRAINT signatures_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.signatures TO authenticated;

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access signatures" ON public.signatures;
CREATE POLICY "Authenticated users full access signatures"
  ON public.signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
