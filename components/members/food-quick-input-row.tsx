'use client'

import { Pin, PinOff } from 'lucide-react'
import {
  calculateProteinGramsForServing,
} from '@/lib/food-search-utils'
import {
  FOOD_PINNED_MAX,
  getQuickInputRows,
  isFoodPinned,
  storedToFoodItem,
  toggleFoodPin,
  type StoredQuickFood,
} from '@/lib/food-quick-input-storage'
import type { FoodItem } from '@/lib/food-search-types'
import { PROTEIN_QUICK_FOODS } from '@/lib/member-body-protein-types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface FoodQuickInputRowProps {
  activeSlotLabel: string
  disabled?: boolean
  embedded?: boolean
  refreshKey: number
  onAddFood: (food: FoodItem) => void
  onStorageChange: () => void
}

function QuickChip({
  label,
  proteinG,
  pinned,
  disabled,
  onAdd,
  onTogglePin,
}: {
  label: string
  proteinG: number
  pinned?: boolean
  disabled?: boolean
  onAdd: () => void
  onTogglePin: () => void
}) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center overflow-hidden rounded-md border border-border/60 bg-background/40',
        pinned && 'border-primary/40 bg-primary/5',
      )}
    >
      <button
        type="button"
        disabled={disabled}
        title={pinned ? '고정 해제' : '상단 고정'}
        className={cn(
          'flex h-7 w-6 shrink-0 items-center justify-center border-r border-border/50 text-muted-foreground hover:text-primary',
          pinned && 'text-primary',
        )}
        onClick={onTogglePin}
      >
        {pinned ? <Pin className="h-3 w-3 fill-current" /> : <PinOff className="h-3 w-3" />}
      </button>
      <button
        type="button"
        disabled={disabled}
        className="flex h-7 min-w-0 max-w-[9rem] items-center gap-1 truncate px-2 text-[11px] text-foreground/85"
        onClick={onAdd}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-medium tabular-nums text-primary/90">+{proteinG}g</span>
      </button>
    </div>
  )
}

function chipFromStored(item: StoredQuickFood) {
  const food = storedToFoodItem(item)
  const proteinG = calculateProteinGramsForServing(food)
  return {
    key: item.id || item.name,
    label: item.name,
    proteinG,
    food,
    pinned: item.pinned,
  }
}

function chipFromDefault(id: string, label: string, grams: number): {
  key: string
  label: string
  proteinG: number
  food: FoodItem
  pinned: boolean
} {
  return {
    key: id,
    label,
    proteinG: grams,
    food: {
      id,
      name: label.split(' ')[0] ?? label,
      serving_label: label,
      serving_size_g: 100,
      calories_kcal: null,
      carbs_g: null,
      protein_g: grams,
      fat_g: null,
      source: 'system',
    },
    pinned: false,
  }
}

export function FoodQuickInputRow({
  activeSlotLabel,
  disabled = false,
  embedded = false,
  refreshKey,
  onAddFood,
  onStorageChange,
}: FoodQuickInputRowProps) {
  const { pinned, recent } = getQuickInputRows()

  const pinnedChips = pinned.map(chipFromStored)
  const recentChips = recent.map(chipFromStored)

  const usedKeys = new Set([
    ...pinnedChips.map((c) => c.key),
    ...recentChips.map((c) => c.key),
  ])

  const defaultChips = PROTEIN_QUICK_FOODS.filter((f) => !usedKeys.has(f.id)).map((f) =>
    chipFromDefault(f.id, f.label, f.grams),
  )

  const chips = [...pinnedChips, ...recentChips, ...defaultChips].slice(0, 14)

  function handleTogglePin(food: FoodItem) {
    const wasPinned = isFoodPinned(food.id, food.name)
    if (!wasPinned && pinned.length >= FOOD_PINNED_MAX) {
      toast.message(`고정은 최대 ${FOOD_PINNED_MAX}개까지 가능합니다.`)
      return
    }
    toggleFoodPin(food)
    onStorageChange()
    toast.message(wasPinned ? '고정 해제했습니다.' : '빠른 입력 상단에 고정했습니다.')
  }

  if (chips.length === 0) return null

  return (
    <div className={cn('space-y-1', embedded && 'border-t border-border/40 pt-2')}>
      <p className="text-[11px] font-medium text-foreground/80">
        빠른 입력 · {activeSlotLabel}
        {pinnedChips.length > 0 ? (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            (📌 {pinnedChips.length})
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-1">
        {chips.map((chip) => (
          <QuickChip
            key={`${chip.key}-${refreshKey}`}
            label={chip.label}
            proteinG={chip.proteinG}
            pinned={chip.pinned}
            disabled={disabled}
            onAdd={() => onAddFood(chip.food)}
            onTogglePin={() => handleTogglePin(chip.food)}
          />
        ))}
      </div>
      {!embedded ? (
        <p className="text-[10px] text-muted-foreground">
          최근 먹은 음식은 자동으로 추가됩니다 (최대 8개). 📌로 고정하면 사라지지 않아요.
        </p>
      ) : null}
    </div>
  )
}
