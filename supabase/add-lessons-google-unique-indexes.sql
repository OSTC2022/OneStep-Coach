-- Google Calendar 중복 insert 방지 — DB 레벨 unique index
-- Supabase SQL Editor에서 실행 (기존 중복 row가 있으면 아래 dedupe가 먼저 정리합니다)
--
-- 컬럼 매핑 (앱 스키마 기준):
--   center_id              → google_account_id  (연결된 Google 계정 = 센터 동기화 범위)
--   coach_id               → instructor_id
--   google_original_start_time → original_start_time
--   start_time / end_time  → lesson_date + start_time + end_time (DATE + TIME)

-- ---------------------------------------------------------------------------
-- 0) 인덱스 생성 전 중복 정리 (세션 차감·먼저 생성된 행 우선 보존)
-- ---------------------------------------------------------------------------

-- 0-a) google_event_id 단일/복합 키 중복
WITH ranked AS (
  SELECT
    id,
    session_deducted,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(google_account_id, ''),
        COALESCE(google_calendar_id, ''),
        google_event_id
      ORDER BY
        CASE WHEN session_deducted THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM public.lessons
  WHERE google_event_id IS NOT NULL
    AND google_calendar_id IS NOT NULL
    AND google_account_id IS NOT NULL
)
DELETE FROM public.lessons
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rn > 1
    AND COALESCE(session_deducted, false) = false
);

-- 레거시: account/calendar 없이 google_event_id만 있는 중복
WITH ranked AS (
  SELECT
    id,
    session_deducted,
    ROW_NUMBER() OVER (
      PARTITION BY google_event_id
      ORDER BY
        CASE WHEN session_deducted THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM public.lessons
  WHERE google_event_id IS NOT NULL
    AND (google_account_id IS NULL OR google_calendar_id IS NULL)
)
DELETE FROM public.lessons
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rn > 1
    AND COALESCE(session_deducted, false) = false
);

-- 0-b) 반복 일정 인스턴스 중복
WITH ranked AS (
  SELECT
    id,
    session_deducted,
    ROW_NUMBER() OVER (
      PARTITION BY
        google_account_id,
        google_calendar_id,
        google_recurring_event_id,
        original_start_time
      ORDER BY
        CASE WHEN session_deducted THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM public.lessons
  WHERE google_recurring_event_id IS NOT NULL
    AND original_start_time IS NOT NULL
    AND google_calendar_id IS NOT NULL
    AND google_account_id IS NOT NULL
)
DELETE FROM public.lessons
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rn > 1
    AND COALESCE(session_deducted, false) = false
);

-- ---------------------------------------------------------------------------
-- 1) google_event_id가 있는 경우
--    unique (center_id, google_calendar_id, google_event_id)
--    → (google_account_id, google_calendar_id, google_event_id)
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.lessons_google_sync_unique;

CREATE UNIQUE INDEX lessons_google_sync_unique
  ON public.lessons (google_account_id, google_calendar_id, google_event_id)
  WHERE google_event_id IS NOT NULL
    AND google_calendar_id IS NOT NULL
    AND google_account_id IS NOT NULL;

COMMENT ON INDEX public.lessons_google_sync_unique IS
  'Google 단일 이벤트 upsert 키 — (center=google_account_id, calendar, event_id)';

-- 레거시 행: account/calendar 미기록 시 google_event_id 단독
DROP INDEX IF EXISTS public.lessons_google_event_id_unique;

CREATE UNIQUE INDEX lessons_google_event_id_unique
  ON public.lessons (google_event_id)
  WHERE google_event_id IS NOT NULL
    AND (google_account_id IS NULL OR google_calendar_id IS NULL);

-- ---------------------------------------------------------------------------
-- 2) 반복 일정 인스턴스
--    unique (center_id, google_calendar_id, google_recurring_event_id, google_original_start_time)
--    → (google_account_id, google_calendar_id, google_recurring_event_id, original_start_time)
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.idx_lessons_google_recurring_instance;

CREATE UNIQUE INDEX lessons_google_recurring_instance_unique
  ON public.lessons (
    google_account_id,
    google_calendar_id,
    google_recurring_event_id,
    original_start_time
  )
  WHERE google_recurring_event_id IS NOT NULL
    AND original_start_time IS NOT NULL
    AND google_calendar_id IS NOT NULL
    AND google_account_id IS NOT NULL;

COMMENT ON INDEX public.lessons_google_recurring_instance_unique IS
  'Google 반복 일정 인스턴스(예외·확장) 중복 방지';

-- 이전 보조 인덱스(ical_uid) — 2번 인덱스와 역할 겹치면 제거
DROP INDEX IF EXISTS public.lessons_google_ical_instance_unique;

-- ---------------------------------------------------------------------------
-- 3) google_event_id 없는 Google 동기화 예외 (보조·좁은 범위)
--    동일 슬롯·회원·강사·제목 중복만 완화 (일반 앱 수동 등록은 대상 아님)
--    unique (center_id, title, start, end, member_id, coach_id) 유사
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS lessons_google_slot_aux_unique
  ON public.lessons (
    google_account_id,
    google_calendar_id,
    lesson_date,
    start_time,
    COALESCE(end_time, '00:00:00'::time without time zone),
    COALESCE(member_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(instructor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(title, '')
  )
  WHERE google_event_id IS NULL
    AND google_account_id IS NOT NULL
    AND google_calendar_id IS NOT NULL
    AND google_recurring_event_id IS NULL
    AND event_type IN ('single', 'materialized');

COMMENT ON INDEX public.lessons_google_slot_aux_unique IS
  '보조: Google event_id 미부여 단일 일정만 — 정상 수동 등록(google 필드 없음)에는 적용 안 됨';

-- 조회 성능 (동기화·날짜 범위)
CREATE INDEX IF NOT EXISTS lessons_google_recurring_lookup_idx
  ON public.lessons (
    google_account_id,
    google_calendar_id,
    google_recurring_event_id,
    original_start_time
  )
  WHERE google_recurring_event_id IS NOT NULL;
