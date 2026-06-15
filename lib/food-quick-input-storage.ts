import type { FoodItem } from '@/lib/food-search-types'

const STORAGE_KEY = 'one-step-coach:food-quick-input'
export const FOOD_RECENT_MAX = 8
export const FOOD_PINNED_MAX = 6

export type StoredQuickFood = {
  id: string
  name: string
  serving_label: string
  serving_size_g: number
  protein_g: number
  calories_kcal?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  pinned: boolean
  usedAt: number
}

type StoragePayload = {
  recent: StoredQuickFood[]
  pinned: StoredQuickFood[]
}

function readPayload(): StoragePayload {
  if (typeof window === 'undefined') return { recent: [], pinned: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { recent: [], pinned: [] }
    const parsed = JSON.parse(raw) as StoragePayload
    return {
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter(isValid) : [],
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter(isValid) : [],
    }
  } catch {
    return { recent: [], pinned: [] }
  }
}

function isValid(item: unknown): item is StoredQuickFood {
  if (typeof item !== 'object' || item === null) return false
  const row = item as StoredQuickFood
  return (
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    row.name.trim().length > 0 &&
    typeof row.protein_g === 'number' &&
    Number.isFinite(row.protein_g)
  )
}

function writePayload(payload: StoragePayload) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

function dedupeKey(item: Pick<StoredQuickFood, 'id' | 'name'>) {
  return item.id || item.name.trim()
}

export function storedToFoodItem(item: StoredQuickFood): FoodItem {
  return {
    id: item.id,
    name: item.name,
    serving_label: item.serving_label,
    serving_size_g: item.serving_size_g,
    calories_kcal: item.calories_kcal ?? null,
    carbs_g: item.carbs_g ?? null,
    protein_g: item.protein_g,
    fat_g: item.fat_g ?? null,
    source: 'custom',
  }
}

export function foodItemToStored(food: FoodItem, pinned = false): StoredQuickFood {
  return {
    id: food.id,
    name: food.name,
    serving_label: food.serving_label,
    serving_size_g: food.serving_size_g,
    protein_g: food.protein_g ?? 0,
    calories_kcal: food.calories_kcal,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
    pinned,
    usedAt: Date.now(),
  }
}

export function getQuickInputRows(): {
  pinned: StoredQuickFood[]
  recent: StoredQuickFood[]
} {
  const { pinned, recent } = readPayload()
  return {
    pinned: pinned.slice(0, FOOD_PINNED_MAX),
    recent: recent
      .filter((item) => !pinned.some((p) => dedupeKey(p) === dedupeKey(item)))
      .slice(0, FOOD_RECENT_MAX),
  }
}

export function recordFoodUse(food: FoodItem): StoragePayload {
  const payload = readPayload()
  const key = dedupeKey(food)
  const stored = foodItemToStored(food, false)

  const pinnedIndex = payload.pinned.findIndex((item) => dedupeKey(item) === key)
  if (pinnedIndex >= 0) {
    payload.pinned[pinnedIndex] = {
      ...payload.pinned[pinnedIndex],
      ...stored,
      pinned: true,
      usedAt: Date.now(),
    }
    writePayload(payload)
    return payload
  }

  payload.recent = [
    { ...stored, pinned: false, usedAt: Date.now() },
    ...payload.recent.filter((item) => dedupeKey(item) !== key),
  ].slice(0, FOOD_RECENT_MAX)

  writePayload(payload)
  return payload
}

export function toggleFoodPin(food: FoodItem): StoragePayload {
  const payload = readPayload()
  const key = dedupeKey(food)
  const pinnedIndex = payload.pinned.findIndex((item) => dedupeKey(item) === key)

  if (pinnedIndex >= 0) {
    payload.pinned.splice(pinnedIndex, 1)
    writePayload(payload)
    return payload
  }

  if (payload.pinned.length >= FOOD_PINNED_MAX) {
    return payload
  }

  payload.pinned = [
    foodItemToStored(food, true),
    ...payload.pinned.filter((item) => dedupeKey(item) !== key),
  ].slice(0, FOOD_PINNED_MAX)

  payload.recent = payload.recent.filter((item) => dedupeKey(item) !== key)
  writePayload(payload)
  return payload
}

export function isFoodPinned(foodId: string, foodName: string): boolean {
  const key = foodId || foodName.trim()
  return readPayload().pinned.some((item) => dedupeKey(item) === key)
}
