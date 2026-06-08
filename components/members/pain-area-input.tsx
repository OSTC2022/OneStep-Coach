'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  PAIN_AREA_CHOICES,
  getPainDisplayTone,
  getWellnessChoiceTone,
  parsePainLevel,
  wellnessToneClasses,
  type PainArea,
} from '@/lib/member-body-wellness'
import { cn } from '@/lib/utils'

type PainAreaInputProps = {
  painArea: PainArea | ''
  painLevel: string
  painAreaNote: string
  onChange: (patch: {
    painArea?: PainArea | ''
    painLevel?: string
    painAreaNote?: string
  }) => void
  disabled?: boolean
}

export function PainAreaInput({
  painArea,
  painLevel,
  painAreaNote,
  onChange,
  disabled = false,
}: PainAreaInputProps) {
  const [open, setOpen] = useState(false)
  const [pendingArea, setPendingArea] = useState<PainArea | null>(null)
  const [draftLevel, setDraftLevel] = useState('')
  const [draftNote, setDraftNote] = useState('')

  function openForArea(area: PainArea) {
    setPendingArea(area)
    setDraftLevel(painArea === area ? painLevel : '')
    setDraftNote(area === 'other' && painArea === 'other' ? painAreaNote : '')
    setOpen(true)
  }

  function handleAreaClick(area: PainArea) {
    if (disabled) return
    if (area === 'none') {
      setOpen(false)
      onChange({ painArea: 'none', painLevel: '', painAreaNote: '' })
      return
    }
    openForArea(area)
  }

  function confirmPopover() {
    if (!pendingArea) return
    onChange({
      painArea: pendingArea,
      painLevel: draftLevel.trim(),
      painAreaNote: pendingArea === 'other' ? draftNote : '',
    })
    setOpen(false)
  }

  function handlePopoverOpenChange(nextOpen: boolean) {
    if (!nextOpen && pendingArea) {
      onChange({
        painArea: pendingArea,
        painLevel: draftLevel.trim(),
        painAreaNote: pendingArea === 'other' ? draftNote : '',
      })
    }
    setOpen(nextOpen)
  }

  const pendingLabel =
    PAIN_AREA_CHOICES.find((choice) => choice.value === pendingArea)?.label ?? ''

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={handlePopoverOpenChange}>
        <div className="flex flex-wrap gap-1.5">
          {PAIN_AREA_CHOICES.map((option) => {
            const selected = painArea === option.value
            const tone =
              selected && option.value !== 'none'
                ? getPainDisplayTone(
                    option.value,
                    parsePainLevel(painLevel),
                  )
                : getWellnessChoiceTone('pain_area', option.value)
            const isNone = option.value === 'none'
            const buttonClassName = cn(
              'min-h-11 min-w-0 border px-3 text-sm shadow-none',
              selected && tone
                ? cn(
                    'border font-medium shadow-none',
                    tone === 'neutral'
                      ? 'border-border/70 bg-muted/20 text-foreground/55'
                      : wellnessToneClasses(tone),
                  )
                : 'border-border/60 bg-background/40 text-foreground/80 hover:bg-muted/25 hover:text-foreground',
            )

            if (isNone) {
              return (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  className={buttonClassName}
                  onClick={() => handleAreaClick(option.value)}
                >
                  {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  {option.label}
                </Button>
              )
            }

            return (
              <PopoverTrigger asChild key={option.value}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  className={buttonClassName}
                  onClick={() => handleAreaClick(option.value)}
                >
                  {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  {option.label}
                  {selected && painLevel ? (
                    <span className="ml-1 text-xs opacity-80">{painLevel}</span>
                  ) : null}
                </Button>
              </PopoverTrigger>
            )
          })}
        </div>

        <PopoverContent className="w-56 space-y-3 p-3" align="start">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {pendingLabel} 통증 정도
            </p>
            <p className="text-xs text-muted-foreground">1~10 숫자로 입력</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pain-level-input" className="text-xs">
              통증 정도
            </Label>
            <Input
              id="pain-level-input"
              type="number"
              min={1}
              max={10}
              inputMode="numeric"
              placeholder="예: 5"
              value={draftLevel}
              onChange={(event) => setDraftLevel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  confirmPopover()
                }
              }}
              autoFocus
            />
          </div>
          {pendingArea === 'other' ? (
            <div className="space-y-1.5">
              <Label htmlFor="pain-area-note-input" className="text-xs">
                부위 직접 입력 (선택)
              </Label>
              <Input
                id="pain-area-note-input"
                type="text"
                placeholder="예: 발가락"
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    confirmPopover()
                  }
                }}
              />
            </div>
          ) : null}
          <Button type="button" size="sm" className="w-full" onClick={confirmPopover}>
            확인
          </Button>
        </PopoverContent>
      </Popover>

      {painArea === 'other' ? (
        <Input
          type="text"
          placeholder="부위 직접 입력 (선택)"
          value={painAreaNote}
          disabled={disabled}
          onChange={(event) => onChange({ painAreaNote: event.target.value })}
          className="h-9 text-sm"
        />
      ) : null}
    </div>
  )
}
