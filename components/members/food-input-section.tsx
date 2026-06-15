'use client'

import { useState } from 'react'
import { ChevronDown, UtensilsCrossed } from 'lucide-react'
import { FoodSearchContent } from '@/components/members/food-search-panel'
import { FoodQuickInputRow } from '@/components/members/food-quick-input-row'
import type { FoodItem } from '@/lib/food-search-types'
import { cn } from '@/lib/utils'

interface FoodInputSectionProps {
  activeSlotLabel: string
  disabled?: boolean
  refreshKey: number
  onAddFood: (food: FoodItem) => void
  onStorageChange: () => void
}

export function FoodInputSection({
  activeSlotLabel,
  disabled = false,
  refreshKey,
  onAddFood,
  onStorageChange,
}: FoodInputSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border border-border/60 bg-background/30">
      <button
        type="button"
        className="flex min-h-9 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground">
          <UtensilsCrossed className="h-3 w-3 shrink-0 text-primary" />
          음식 검색 · 빠른 입력
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border/50 px-2.5 pb-2.5 pt-2">
          <FoodSearchContent
            activeSlotLabel={activeSlotLabel}
            disabled={disabled}
            autoFocus
            onAddFood={onAddFood}
          />

          <FoodQuickInputRow
            activeSlotLabel={activeSlotLabel}
            disabled={disabled}
            embedded
            refreshKey={refreshKey}
            onAddFood={onAddFood}
            onStorageChange={onStorageChange}
          />
        </div>
      ) : null}
    </div>
  )
}
