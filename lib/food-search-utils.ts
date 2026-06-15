import type { FoodItem } from '@/lib/food-search-types'

export function formatFoodNutritionSummary(food: FoodItem): string {
  const parts: string[] = [food.serving_label || `${food.serving_size_g}g`]
  if (food.calories_kcal != null) {
    parts.push(`${Math.round(food.calories_kcal)}kcal`)
  }
  if (food.carbs_g != null) {
    parts.push(`탄수 ${formatMacro(food.carbs_g)}g`)
  }
  if (food.protein_g != null) {
    parts.push(`단백 ${formatMacro(food.protein_g)}g`)
  }
  return parts.join(' · ')
}

function formatMacro(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function calculateProteinGramsForServing(
  food: FoodItem,
  servingGrams?: number,
): number {
  if (food.protein_g == null) return 0
  const baseSize = food.serving_size_g > 0 ? food.serving_size_g : 100
  const grams = servingGrams ?? baseSize
  return Math.round(((food.protein_g / baseSize) * grams) * 10) / 10
}

export function isHighProteinFood(food: FoodItem): boolean {
  if (food.protein_g == null || food.serving_size_g <= 0) return false
  const per100g = (food.protein_g / food.serving_size_g) * 100
  return per100g >= 15
}

export function formatProteinAddLabel(food: FoodItem, proteinG: number): string {
  const serving = food.serving_label || `${food.serving_size_g}g`
  return `${food.name} ${serving} · +${proteinG}g`
}
