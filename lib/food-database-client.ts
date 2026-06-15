import { createClient } from '@supabase/supabase-js'

/** 별도 Supabase(식품 DB)가 있으면 FOOD_DATABASE_URL 로 연결, 없으면 앱 Supabase 사용 */
export function createFoodDatabaseClient() {
  const url =
    process.env.FOOD_DATABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.FOOD_DATABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Food database credentials are not configured')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export const FOOD_ITEM_TABLE_CANDIDATES = [
  'food_items',
  'foods',
  'nutrition_foods',
] as const
