-- 센터 메인 랭킹 전용 리그 (이벤트 시즌과 별도)
-- 이어서 add-center-portal-member-mileage-rls.sql 도 실행하세요.

INSERT INTO public.running_leagues (
  title,
  description,
  starts_at,
  ends_at,
  status,
  audience,
  target_group
)
SELECT
  'ONE STEP RUNNING RANKING',
  '__center_portal_ranking__ 센터 메인 랭킹 (이벤트 시즌과 별도)',
  date_trunc('year', CURRENT_DATE)::date,
  '2099-12-31'::date,
  'active',
  'adult',
  'all'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.running_leagues
  WHERE description LIKE '%__center_portal_ranking__%'
     OR title = 'ONE STEP RUNNING RANKING'
);
