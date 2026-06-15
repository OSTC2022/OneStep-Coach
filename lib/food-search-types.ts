export interface FoodItem {
  id: string
  name: string
  serving_label: string
  serving_size_g: number
  calories_kcal: number | null
  carbs_g: number | null
  protein_g: number | null
  fat_g: number | null
  source?: 'system' | 'custom'
}

export interface FoodSearchResult {
  exact: FoodItem[]
  similar: FoodItem[]
  tableReady: boolean
  source: 'database' | 'fallback'
}

export interface CreateCustomFoodInput {
  name: string
  serving_label?: string
  serving_size_g?: number
  calories_kcal?: number | null
  carbs_g?: number | null
  protein_g: number
  fat_g?: number | null
}
