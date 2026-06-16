-- google_event_id 기준 중복 임시 일정 정리 (세션 차감된 행 우선 보존)
-- Supabase SQL Editor에서 실행

WITH ranked AS (
  SELECT
    id,
    google_event_id,
    session_deducted,
    ROW_NUMBER() OVER (
      PARTITION BY google_event_id
      ORDER BY
        CASE WHEN session_deducted THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST
    ) AS rn
  FROM public.lessons
  WHERE google_event_id IS NOT NULL
)
DELETE FROM public.lessons
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1 AND COALESCE(session_deducted, false) = false
);
