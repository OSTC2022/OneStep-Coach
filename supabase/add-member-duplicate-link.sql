-- 회원 가입 경로 / 계정 연동 / 중복 후보 / 회원권 상태
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS source_type text
    CHECK (source_type IS NULL OR source_type IN ('admin_created', 'self_signup'));

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS account_link_status text
    CHECK (
      account_link_status IS NULL
      OR account_link_status IN (
        'linked',
        'unlinked',
        'duplicate_candidate',
        'dismissed'
      )
    );

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS membership_status text
    CHECK (
      membership_status IS NULL
      OR membership_status IN ('active', 'none', 'expired', 'pending')
    );

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS duplicate_of_member_id uuid REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS duplicate_match_reason text;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS duplicate_group_id uuid;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS linked_at timestamptz;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS duplicate_review_note text;

CREATE INDEX IF NOT EXISTS idx_members_account_link_status
  ON members (account_link_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_members_source_type
  ON members (source_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_members_duplicate_of
  ON members (duplicate_of_member_id)
  WHERE deleted_at IS NULL AND duplicate_of_member_id IS NOT NULL;

-- 연결/검토 이력 (삭제하지 않고 감사 로그로 유지)
CREATE TABLE IF NOT EXISTS member_link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  keep_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  merge_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  auth_user_id uuid,
  match_reason text,
  note text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_link_events_created
  ON member_link_events (created_at DESC);

-- 기존 데이터 기본값
UPDATE members
SET source_type = CASE
  WHEN auth_user_id IS NOT NULL
    OR user_id IS NOT NULL
    OR coalesce(memo, '') ILIKE '%가입%'
    THEN 'self_signup'
  ELSE 'admin_created'
END
WHERE source_type IS NULL
  AND deleted_at IS NULL;

UPDATE members
SET account_link_status = CASE
  WHEN auth_user_id IS NOT NULL OR user_id IS NOT NULL THEN 'linked'
  ELSE 'unlinked'
END
WHERE account_link_status IS NULL
  AND deleted_at IS NULL;

UPDATE members
SET membership_status = CASE
  WHEN coalesce(remaining_sessions, 0) > 0 THEN 'active'
  ELSE 'none'
END
WHERE membership_status IS NULL
  AND deleted_at IS NULL;

UPDATE members
SET linked_at = coalesce(linked_at, registered_at, created_at)
WHERE (auth_user_id IS NOT NULL OR user_id IS NOT NULL)
  AND linked_at IS NULL
  AND deleted_at IS NULL;

COMMENT ON COLUMN members.source_type IS 'admin_created | self_signup';
COMMENT ON COLUMN members.account_link_status IS 'linked | unlinked | duplicate_candidate | dismissed';
COMMENT ON COLUMN members.membership_status IS 'active | none | expired | pending — 화면용 캐시, 패키지 기준 재계산 가능';
COMMENT ON COLUMN members.duplicate_of_member_id IS '중복 후보로 지목된 기존(대표) 회원';
