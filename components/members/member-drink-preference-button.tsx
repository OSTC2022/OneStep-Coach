'use client'

import { useEffect, useState } from 'react'
import { Droplets } from 'lucide-react'
import { toast } from 'sonner'
import { updateMemberDrinkPreference } from '@/lib/actions/members'
import {
  MEMBER_DRINK_PREFERENCE_MAX_LENGTH,
  MEMBER_DRINK_PREFERENCE_OPTIONS,
  formatMemberDrinkPreferenceLabel,
  getMemberDrinkPreferenceDisplay,
  normalizeMemberDrinkPreferenceInput,
} from '@/lib/member-drink-preference'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type MemberDrinkPreferenceButtonProps = {
  memberId: string
  value?: string | null
  compact?: boolean
  className?: string
  onChanged?: (value: string | null) => void
}

export function MemberDrinkPreferenceButton({
  memberId,
  value,
  compact = false,
  className,
  onChanged,
}: MemberDrinkPreferenceButtonProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [localValue, setLocalValue] = useState<string | null | undefined>(undefined)
  const [customDraft, setCustomDraft] = useState('')

  useEffect(() => {
    setLocalValue(undefined)
  }, [memberId, value])

  useEffect(() => {
    if (!open) return
    const currentValue = localValue !== undefined ? localValue : value ?? null
    const display = getMemberDrinkPreferenceDisplay(currentValue)
    setCustomDraft(display?.kind === 'custom' ? display.label : '')
  }, [open, localValue, value])

  const current = localValue !== undefined ? localValue : value ?? null
  const display = getMemberDrinkPreferenceDisplay(current)

  async function savePreference(next: string | null) {
    if (saving) return
    const normalized = normalizeMemberDrinkPreferenceInput(next)
    if ((normalized ?? null) === (normalizeMemberDrinkPreferenceInput(current) ?? null)) {
      setOpen(false)
      return
    }

    const previous = current
    setLocalValue(normalized)
    setSaving(true)
    const result = await updateMemberDrinkPreference(memberId, normalized)
    setSaving(false)

    if (result.error) {
      setLocalValue(previous ?? null)
      toast.error('음료 선호 저장 실패', { description: result.error })
      return
    }

    const saved = result.data?.drink_preference ?? null
    setLocalValue(saved)
    onChanged?.(saved)
    setOpen(false)
    toast.success(
      saved ? `음료: ${formatMemberDrinkPreferenceLabel(saved)}` : '음료 선호를 지웠습니다.',
    )
  }

  function submitCustom() {
    const normalized = normalizeMemberDrinkPreferenceInput(customDraft)
    if (!normalized) {
      toast.error('음료 이름을 입력해주세요.')
      return
    }
    void savePreference(normalized)
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded border font-bold leading-none transition-colors',
            compact ? 'h-4 min-w-4 px-0.5 text-[9px]' : 'h-5 min-w-5 px-1 text-[10px]',
            display
              ? display.chipClassName
              : 'border-dashed border-muted-foreground/40 bg-muted/20 text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground',
            className,
          )}
          title={
            display
              ? `음료: ${display.label} (클릭하여 변경)`
              : '음료 선호 미설정 (클릭하여 설정)'
          }
          aria-label={
            display ? `음료 선호 ${display.label}` : '음료 선호 설정'
          }
          onPointerDown={(event) => {
            // 타일 확장·이름 메뉴와 겹치지 않도록만 전파 차단 (preventDefault 하면 팝오버가 안 열림)
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          {display ? (
            display.kind === 'water' ? (
              <Droplets className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
            ) : (
              display.shortLabel
            )
          ) : (
            <Droplets className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3', 'opacity-60')} />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="z-[200] w-52 p-1.5"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="px-1.5 pb-1 text-[10px] font-medium text-muted-foreground">
          음료 선호
        </p>
        <div className="flex flex-col gap-0.5">
          {MEMBER_DRINK_PREFERENCE_OPTIONS.map((item) => {
            const selected = current === item.value
            return (
              <button
                key={item.value}
                type="button"
                disabled={saving}
                onClick={() => void savePreference(item.value)}
                className={cn(
                  'flex items-center gap-2 rounded px-1.5 py-1.5 text-left text-xs transition-colors',
                  selected
                    ? 'bg-primary/15 text-foreground'
                    : 'hover:bg-muted text-foreground/90',
                  saving && 'opacity-60',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded border text-[10px] font-bold',
                    item.chipClassName,
                  )}
                >
                  {item.group === 'water' ? (
                    <Droplets className="h-3 w-3" />
                  ) : (
                    item.shortLabel
                  )}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-1.5 space-y-1 border-t border-border/60 px-1 pt-1.5">
          <p className="text-[10px] font-medium text-muted-foreground">수동 입력</p>
          <div className="flex gap-1">
            <Input
              value={customDraft}
              maxLength={MEMBER_DRINK_PREFERENCE_MAX_LENGTH}
              placeholder="예: 이온음료"
              disabled={saving}
              className="h-7 px-1.5 text-xs"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitCustom()
                }
              }}
              onChange={(event) => setCustomDraft(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={saving || !customDraft.trim()}
              className="h-7 shrink-0 px-2 text-[11px]"
              onClick={submitCustom}
            >
              저장
            </Button>
          </div>
        </div>

        <button
          type="button"
          disabled={saving || current == null}
          onClick={() => void savePreference(null)}
          className={cn(
            'mt-1 w-full rounded px-1.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            (saving || current == null) && 'opacity-50',
          )}
        >
          미설정
        </button>
      </PopoverContent>
    </Popover>
  )
}
