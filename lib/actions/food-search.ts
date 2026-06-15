'use server'

import { filterAndSortKoreanNames, scoreKoreanNameSearch } from '@/lib/korean-search'
import {
  createFoodDatabaseClient,
  FOOD_ITEM_TABLE_CANDIDATES,
} from '@/lib/food-database-client'
import { FOOD_CATALOG } from '@/lib/food-catalog'
import type {
  CreateCustomFoodInput,
  FoodItem,
  FoodSearchResult,
} from '@/lib/food-search-types'
import { createClient } from '@/lib/supabase/server'

const EXACT_LIMIT = 8
const SIMILAR_LIMIT = 6
const FETCH_LIMIT = 50

function normalizeFoodRow(row: Record<string, unknown>, table: string): FoodItem | null {
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!name) return null

  const id =
    typeof row.id === 'string'
      ? row.id
      : `${table}-${name}-${row.serving_size_g ?? 100}`

  return {
    id,
    name,
    serving_label:
      typeof row.serving_label === 'string' && row.serving_label.trim()
        ? row.serving_label.trim()
        : `${row.serving_size_g ?? 100}g`,
    serving_size_g: Number(row.serving_size_g) > 0 ? Number(row.serving_size_g) : 100,
    calories_kcal: toNumberOrNull(row.calories_kcal ?? row.kcal),
    carbs_g: toNumberOrNull(row.carbs_g ?? row.carbohydrate_g),
    protein_g: toNumberOrNull(row.protein_g),
    fat_g: toNumberOrNull(row.fat_g),
    source: row.created_by ? 'custom' : 'system',
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('does not exist') ||
    lower.includes('could not find the table') ||
    lower.includes('schema cache')
  )
}

function isExactMatch(name: string, query: string): boolean {
  const n = name.toLowerCase()
  const q = query.trim().toLowerCase()
  return n.includes(q)
}

function splitSearchResults(items: FoodItem[], query: string): Pick<FoodSearchResult, 'exact' | 'similar'> {
  const trimmed = query.trim()
  const ranked = filterAndSortKoreanNames(items, trimmed, FETCH_LIMIT)
  const exact: FoodItem[] = []
  const similar: FoodItem[] = []
  const seen = new Set<string>()

  for (const item of ranked) {
    if (seen.has(item.id)) continue
    if (isExactMatch(item.name, trimmed)) {
      if (exact.length < EXACT_LIMIT) {
        exact.push(item)
        seen.add(item.id)
      }
    }
  }

  for (const item of ranked) {
    if (seen.has(item.id)) continue
    const score = scoreKoreanNameSearch(item.name, trimmed)
    if (score < Number.POSITIVE_INFINITY && similar.length < SIMILAR_LIMIT) {
      similar.push(item)
      seen.add(item.id)
    }
  }

  return { exact, similar }
}

async function searchFoodTable(
  query: string,
): Promise<{ items: FoodItem[]; tableReady: boolean }> {
  const client = createFoodDatabaseClient()
  const trimmed = query.trim()
  if (!trimmed) {
    return { items: [], tableReady: true }
  }

  for (const table of FOOD_ITEM_TABLE_CANDIDATES) {
    const { data, error } = await client
      .from(table)
      .select(
        'id, name, serving_label, serving_size_g, calories_kcal, carbs_g, protein_g, fat_g, created_by',
      )
      .ilike('name', `%${trimmed}%`)
      .limit(FETCH_LIMIT)

    if (error) {
      if (isMissingTableError(error.message)) continue
      throw error
    }

    const items = (data ?? [])
      .map((row) => normalizeFoodRow(row as Record<string, unknown>, table))
      .filter((item): item is FoodItem => item != null)

    return { items, tableReady: true }
  }

  return { items: [], tableReady: false }
}

function searchCatalog(query: string): FoodItem[] {
  return filterAndSortKoreanNames(FOOD_CATALOG, query, FETCH_LIMIT)
}

function buildResult(
  items: FoodItem[],
  query: string,
  tableReady: boolean,
  source: FoodSearchResult['source'],
): FoodSearchResult {
  const { exact, similar } = splitSearchResults(items, query)
  return { exact, similar, tableReady, source }
}

export async function searchFoods(query: string): Promise<FoodSearchResult> {
  const trimmed = query.trim()
  if (!trimmed) {
    return { exact: [], similar: [], tableReady: true, source: 'database' }
  }

  try {
    const { items: dbItems, tableReady } = await searchFoodTable(trimmed)
    const catalogItems = searchCatalog(trimmed)
    const merged = mergeFoodItems(dbItems, catalogItems)
    const source =
      dbItems.length > 0 && catalogItems.length === 0
        ? 'database'
        : dbItems.length > 0
          ? 'database'
          : 'fallback'

    if (merged.length > 0) {
      return buildResult(merged, trimmed, tableReady, source)
    }

    return { exact: [], similar: [], tableReady, source: 'database' }
  } catch {
    const catalogItems = searchCatalog(trimmed)
    return buildResult(catalogItems, trimmed, false, 'fallback')
  }
}

function mergeFoodItems(primary: FoodItem[], secondary: FoodItem[]): FoodItem[] {
  const seen = new Set<string>()
  const out: FoodItem[] = []
  for (const item of [...primary, ...secondary]) {
    const key = `${item.name}::${item.serving_label}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export async function createCustomFoodItem(
  input: CreateCustomFoodInput,
): Promise<{ item?: FoodItem; error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: '음식 이름을 입력해주세요.' }
  if (!Number.isFinite(input.protein_g) || input.protein_g < 0) {
    return { error: '단백질(g)을 입력해주세요.' }
  }

  const servingSize = input.serving_size_g && input.serving_size_g > 0 ? input.serving_size_g : 100
  const payload = {
    name,
    serving_label: input.serving_label?.trim() || `${servingSize}g`,
    serving_size_g: servingSize,
    calories_kcal: input.calories_kcal ?? null,
    carbs_g: input.carbs_g ?? null,
    protein_g: input.protein_g,
    fat_g: input.fat_g ?? null,
    is_public: false,
  }

  try {
    const foodClient = createFoodDatabaseClient()
    let lastError: string | null = null

    for (const table of FOOD_ITEM_TABLE_CANDIDATES) {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { data, error } = await foodClient
        .from(table)
        .insert({
          ...payload,
          created_by: user?.id ?? null,
        })
        .select(
          'id, name, serving_label, serving_size_g, calories_kcal, carbs_g, protein_g, fat_g, created_by',
        )
        .single()

      if (error) {
        lastError = error.message
        if (isMissingTableError(error.message)) continue
        return { error: '음식 저장에 실패했습니다.' }
      }

      const item = normalizeFoodRow(data as Record<string, unknown>, table)
      if (!item) return { error: '음식 저장에 실패했습니다.' }
      return { item: { ...item, source: 'custom' } }
    }

    if (lastError && isMissingTableError(lastError)) {
      return {
        error:
          '음식 DB 테이블이 아직 없습니다. Supabase SQL Editor에서 add-food-items.sql을 실행해주세요.',
      }
    }

    return { error: '음식 저장에 실패했습니다.' }
  } catch {
    return { error: '음식 저장에 실패했습니다.' }
  }
}
