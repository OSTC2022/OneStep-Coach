-- 식품 영양 DB (음식 검색)
-- 별도 Supabase 프로젝트를 쓰는 경우 FOOD_DATABASE_URL / FOOD_DATABASE_ANON_KEY 로 연결

CREATE TABLE IF NOT EXISTS public.food_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  serving_label TEXT NOT NULL DEFAULT '100g',
  serving_size_g NUMERIC NOT NULL DEFAULT 100,
  calories_kcal NUMERIC,
  carbs_g NUMERIC,
  protein_g NUMERIC,
  fat_g NUMERIC,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_items_name ON public.food_items (name);

ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food_items_select_public" ON public.food_items;
CREATE POLICY "food_items_select_public"
  ON public.food_items FOR SELECT
  TO authenticated
  USING (is_public = true OR created_by = auth.uid());

DROP POLICY IF EXISTS "food_items_insert_own" ON public.food_items;
CREATE POLICY "food_items_insert_own"
  ON public.food_items FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

COMMENT ON TABLE public.food_items IS '음식 검색 · 단백질 보충용 영양 DB';

-- 전체 카탈로그(125종+)는 seed-food-catalog.sql 실행

-- 기본 식품 (중복 방지)
INSERT INTO public.food_items (name, serving_label, serving_size_g, calories_kcal, carbs_g, protein_g, fat_g, is_public)
SELECT * FROM (VALUES
  ('계란', '1개(50g)', 50, 78, 0.6, 6, 5.3, true),
  ('닭가슴살', '100g', 100, 165, 0, 31, 3.6, true),
  ('소고기(등심)', '100g', 100, 250, 0, 26, 15, true),
  ('돼지고기(안심)', '100g', 100, 143, 0, 21, 6, true),
  ('연어', '100g', 100, 208, 0, 20, 13, true),
  ('참치(캔)', '100g', 100, 116, 0, 26, 1, true),
  ('고등어', '100g', 100, 205, 0, 19, 14, true),
  ('두부', '100g', 100, 76, 1.9, 8, 4.8, true),
  ('우유', '200ml', 200, 130, 10, 6.6, 7, true),
  ('그릭요거트', '150g', 150, 130, 6, 15, 4, true),
  ('프로틴(1회)', '30g', 30, 120, 3, 24, 1.5, true),
  ('설렁탕', '100g', 100, 45, 2, 4.5, 2, true),
  ('곰탕면', '100g', 100, 95, 16, 5, 1.5, true),
  ('도가니탕', '100g', 100, 62, 0.5, 12, 1.2, true),
  ('삼계탕', '100g', 100, 120, 1, 14, 6, true),
  ('밥', '1공기(210g)', 210, 310, 68, 5.5, 0.6, true),
  ('현미밥', '1공기(210g)', 210, 290, 60, 6.2, 1.8, true),
  ('새우', '100g', 100, 99, 0.2, 24, 0.3, true),
  ('오징어', '100g', 100, 92, 3.1, 16, 1.4, true),
  ('렌틸콩', '100g', 100, 116, 20, 9, 0.4, true),
  ('오트밀', '100g', 100, 389, 66, 17, 7, true),
  ('바나나', '1개(120g)', 120, 105, 27, 1.3, 0.4, true),
  ('아몬드', '30g', 30, 174, 6, 6, 15, true),
  ('슬라이스 치즈', '1장(20g)', 20, 70, 0.4, 4.2, 5.6, true),
  ('김치찌개', '100g', 100, 45, 4, 3.5, 2, true),
  ('된장찌개', '100g', 100, 55, 5, 4, 2.5, true),
  ('닭볶음탕', '100g', 100, 130, 8, 14, 5, true),
  ('제육볶음', '100g', 100, 180, 6, 16, 10, true),
  ('불고기', '100g', 100, 190, 8, 18, 9, true),
  ('계란찜', '100g', 100, 110, 2, 10, 7, true)
) AS seed(name, serving_label, serving_size_g, calories_kcal, carbs_g, protein_g, fat_g, is_public)
WHERE NOT EXISTS (SELECT 1 FROM public.food_items LIMIT 1);
