-- 원스텝 러닝 리그 이벤트 subtype 추가

ALTER TABLE public.center_board_posts DROP CONSTRAINT IF EXISTS center_board_posts_event_subtype_check;
ALTER TABLE public.center_board_posts
  ADD CONSTRAINT center_board_posts_event_subtype_check
  CHECK (event_subtype IS NULL OR event_subtype IN ('mileage_challenge', 'running_league'));

NOTIFY pgrst, 'reload schema';
