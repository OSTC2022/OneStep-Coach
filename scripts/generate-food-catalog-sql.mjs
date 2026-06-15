import fs from 'node:fs'

const src = fs.readFileSync('lib/food-catalog.ts', 'utf8')
const rows = []
const re =
  /food\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/g
let m
while ((m = re.exec(src))) rows.push(m)

const values = rows
  .map(([, , name, label, size, kcal, carb, prot, fat]) => {
    const esc = (s) => s.replace(/'/g, "''")
    return `  ('${esc(name)}', '${esc(label)}', ${size}, ${kcal}, ${carb}, ${prot}, ${fat}, true)`
  })
  .join(',\n')

const sql = `-- 식품 카탈로그 전체 시드 (add-food-items.sql 실행 후)
INSERT INTO public.food_items (name, serving_label, serving_size_g, calories_kcal, carbs_g, protein_g, fat_g, is_public)
SELECT v.name, v.serving_label, v.serving_size_g, v.calories_kcal, v.carbs_g, v.protein_g, v.fat_g, v.is_public
FROM (VALUES
${values}
) AS v(name, serving_label, serving_size_g, calories_kcal, carbs_g, protein_g, fat_g, is_public)
WHERE NOT EXISTS (
  SELECT 1 FROM public.food_items f
  WHERE f.name = v.name AND f.serving_label = v.serving_label
);
`

fs.writeFileSync('supabase/seed-food-catalog.sql', sql)
console.log(`seed-food-catalog.sql: ${rows.length} rows`)
