'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { searchFoods } from '@/lib/actions/food-search'
import {
  calculateProteinGramsForServing,
  formatFoodNutritionSummary,
} from '@/lib/food-search-utils'
import type { FoodItem } from '@/lib/food-search-types'
import { Button } from '@/components/ui/button'
import { FoodManualAddDialog } from '@/components/members/food-manual-add-dialog'

interface FoodSearchContentProps {
  activeSlotLabel: string
  disabled?: boolean
  autoFocus?: boolean
  onAddFood: (food: FoodItem) => void
}

function FoodResultRow({
  food,
  disabled,
  onAdd,
}: {
  food: FoodItem
  disabled?: boolean
  onAdd: (food: FoodItem) => void
}) {
  const proteinG = calculateProteinGramsForServing(food)
  return (
    <li className="flex items-start gap-2 border-b border-border/40 py-1.5 last:border-0">
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-left text-xs font-medium text-foreground">{food.name}</p>
        <p className="truncate text-left text-[10px] text-muted-foreground">
          {formatFoodNutritionSummary(food)}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled || proteinG <= 0}
        className="h-7 shrink-0 px-2 text-xs tabular-nums text-primary hover:text-primary"
        onClick={() => onAdd(food)}
      >
        +{proteinG}g
      </Button>
    </li>
  )
}

export function FoodSearchContent({
  activeSlotLabel,
  disabled = false,
  autoFocus = false,
  onAddFood,
}: FoodSearchContentProps) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [exact, setExact] = useState<FoodItem[]>([])
  const [similar, setSimilar] = useState<FoodItem[]>([])
  const [manualOpen, setManualOpen] = useState(false)
  const requestIdRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [autoFocus])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setExact([])
      setSimilar([])
      setLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)

    const timer = window.setTimeout(async () => {
      const response = await searchFoods(trimmed)
      if (requestId !== requestIdRef.current) return
      setExact(response.exact)
      setSimilar(response.similar)
      setLoading(false)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [query])

  function handleAdd(food: FoodItem) {
    const proteinG = calculateProteinGramsForServing(food)
    if (proteinG <= 0) {
      toast.error('단백질 정보가 없는 음식입니다.')
      return
    }
    onAddFood(food)
    toast.success(`${activeSlotLabel} +${proteinG}g (${food.name})`)
  }

  const trimmedQuery = query.trim()
  const hasResults = exact.length > 0 || similar.length > 0

  return (
    <>
      <div className="space-y-2">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            dir="ltr"
            lang="ko"
            autoComplete="off"
            value={query}
            disabled={disabled}
            placeholder="닭가슴살, 우유, 설렁탕…"
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full min-w-0 rounded-md border border-border/70 bg-background py-0 pl-7 pr-7 text-left text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
          {query ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground"
              onClick={() => setQuery('')}
              aria-label="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">{activeSlotLabel}에 단백질 더하기</p>
          <button
            type="button"
            disabled={disabled}
            className="shrink-0 text-[10px] text-primary underline-offset-2 hover:underline"
            onClick={() => setManualOpen(true)}
          >
            + 직접 추가
          </button>
        </div>

        {trimmedQuery ? (
          <div className="max-h-36 overflow-y-auto overscroll-contain rounded-md border border-border/50 bg-card/40 px-2">
            {loading ? (
              <div className="flex items-center gap-1.5 py-3 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                검색 중…
              </div>
            ) : hasResults ? (
              <div className="py-1">
                {exact.length > 0 ? (
                  <>
                    <p className="sticky top-0 bg-card/95 py-1 text-[10px] font-medium text-muted-foreground">
                      정확한 결과
                    </p>
                    <ul>
                      {exact.map((food) => (
                        <FoodResultRow
                          key={food.id}
                          food={food}
                          disabled={disabled}
                          onAdd={handleAdd}
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
                {similar.length > 0 ? (
                  <>
                    <p className="sticky top-0 bg-card/95 py-1 text-[10px] font-medium text-muted-foreground">
                      비슷한 음식
                    </p>
                    <ul>
                      {similar.map((food) => (
                        <FoodResultRow
                          key={`sim-${food.id}`}
                          food={food}
                          disabled={disabled}
                          onAdd={handleAdd}
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2 py-2">
                <p className="text-[11px] text-muted-foreground">결과 없음</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  className="h-7 w-full text-[11px]"
                  onClick={() => setManualOpen(true)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {trimmedQuery} 직접 추가
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <FoodManualAddDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        defaultName={trimmedQuery}
        onSaved={(food) => handleAdd(food)}
      />
    </>
  )
}
