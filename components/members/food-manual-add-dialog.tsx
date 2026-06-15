'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCustomFoodItem } from '@/lib/actions/food-search'
import type { FoodItem } from '@/lib/food-search-types'

interface FoodManualAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName?: string
  onSaved: (food: FoodItem) => void
}

export function FoodManualAddDialog({
  open,
  onOpenChange,
  defaultName = '',
  onSaved,
}: FoodManualAddDialogProps) {
  const [name, setName] = useState(defaultName)
  const [proteinG, setProteinG] = useState('')
  const [carbsG, setCarbsG] = useState('')
  const [caloriesKcal, setCaloriesKcal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setProteinG('')
    setCarbsG('')
    setCaloriesKcal('')
    setError(null)
  }, [open, defaultName])

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await createCustomFoodItem({
      name,
      protein_g: Number(proteinG),
      carbs_g: carbsG ? Number(carbsG) : null,
      calories_kcal: caloriesKcal ? Number(caloriesKcal) : null,
      serving_label: '100g',
      serving_size_g: 100,
    })
    setSaving(false)

    if (result.error) {
      setError(result.error)
      return
    }
    if (result.item) {
      onSaved(result.item)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>음식 직접 추가</DialogTitle>
          <DialogDescription>
            영양성분표(100g 기준)를 입력하면 저장 후 단백질 기록에 바로 쓸 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="food-name">음식 이름</Label>
            <Input
              id="food-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 도가니탕"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="food-protein">단백질(g)*</Label>
              <Input
                id="food-protein"
                type="number"
                min={0}
                step={0.1}
                value={proteinG}
                onChange={(e) => setProteinG(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-carbs">탄수(g)</Label>
              <Input
                id="food-carbs"
                type="number"
                min={0}
                step={0.1}
                value={carbsG}
                onChange={(e) => setCarbsG(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-kcal">칼로리</Label>
              <Input
                id="food-kcal"
                type="number"
                min={0}
                step={1}
                value={caloriesKcal}
                onChange={(e) => setCaloriesKcal(e.target.value)}
              />
            </div>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? '저장 중…' : '저장 후 추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
