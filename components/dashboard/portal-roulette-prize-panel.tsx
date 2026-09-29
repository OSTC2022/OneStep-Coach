'use client'

import { useEffect, useState, useTransition } from 'react'
import { Gift, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import {
  canEditPortalRoulettePrizes,
  getPortalRoulettePrizes,
  updatePortalRoulettePrize,
} from '@/lib/actions/portal-roulette-prizes'
import type { PortalRouletteMode } from '@/lib/running-league/portal-roulette'
import {
  EMPTY_PORTAL_ROULETTE_PRIZES,
  normalizePortalRoulettePrizeMonthKey,
  portalRoulettePrizeForMode,
  portalRoulettePrizeModeLabel,
  type PortalRoulettePrizes,
} from '@/lib/running-league/portal-roulette-prizes'
import { formatPortalManageMonthOptionLabel } from '@/lib/running-league/portal-manage-month'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type PortalRoulettePrizePanelProps = {
  mode: PortalRouletteMode
  /** yyyy-MM — 해당 월 경품 */
  monthKey: string
  className?: string
}

export function PortalRoulettePrizePanel({
  mode,
  monthKey,
  className,
}: PortalRoulettePrizePanelProps) {
  const resolvedMonthKey = normalizePortalRoulettePrizeMonthKey(monthKey)
  const monthLabel = formatPortalManageMonthOptionLabel(resolvedMonthKey)

  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [editing, setEditing] = useState(false)
  const [prizes, setPrizes] = useState<PortalRoulettePrizes>(EMPTY_PORTAL_ROULETTE_PRIZES)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setEditing(false)
    void Promise.all([
      getPortalRoulettePrizes(resolvedMonthKey),
      canEditPortalRoulettePrizes(),
    ])
      .then(([nextPrizes, editable]) => {
        if (cancelled) return
        setPrizes(nextPrizes)
        setCanEdit(editable)
        setDraft(portalRoulettePrizeForMode(nextPrizes, mode))
      })
      .catch(() => {
        if (cancelled) return
        setPrizes(EMPTY_PORTAL_ROULETTE_PRIZES)
        setCanEdit(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [resolvedMonthKey])

  useEffect(() => {
    setDraft(portalRoulettePrizeForMode(prizes, mode))
    setEditing(false)
  }, [mode, prizes])

  const prizeText = portalRoulettePrizeForMode(prizes, mode)
  const modeLabel = portalRoulettePrizeModeLabel(mode)

  function save() {
    startTransition(async () => {
      const result = await updatePortalRoulettePrize({
        mode,
        text: draft,
        monthKey: resolvedMonthKey,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setPrizes(result.prizes)
      setEditing(false)
      toast.success(`${monthLabel} ${modeLabel} 경품을 저장했습니다.`)
    })
  }

  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center gap-2 rounded-xl border border-lime-500/15 bg-black/30 px-3 py-4 text-sm text-zinc-500',
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        경품 불러오는 중…
      </div>
    )
  }

  if (!canEdit) {
    if (!prizeText.trim()) return null
    return (
      <div
        className={cn(
          'rounded-xl border border-lime-400/30 bg-gradient-to-b from-lime-500/15 to-lime-500/5 px-4 py-3',
          className,
        )}
      >
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-lime-300/90">
            <Gift className="h-3.5 w-3.5" aria-hidden />
            {modeLabel} 경품
          </div>
          <span className="text-[10px] tabular-nums text-lime-200/70">{monthLabel}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-lime-50">{prizeText}</p>
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        className={cn(
          'rounded-xl border border-lime-500/25 bg-black/35 px-4 py-3',
          className,
        )}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-lime-300/90">
              <Gift className="h-3.5 w-3.5" aria-hidden />
              {modeLabel} 경품
            </div>
            <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">{monthLabel}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 border-lime-500/30 px-2 text-[11px] text-lime-100 hover:bg-lime-500/10"
            onClick={() => setEditing(true)}
          >
            <Pencil className="mr-1 h-3 w-3" aria-hidden />
            설정
          </Button>
        </div>
        {prizeText.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">{prizeText}</p>
        ) : (
          <p className="text-sm text-zinc-500">
            {monthLabel} 경품이 없습니다. 설정에서 입력하세요.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2 rounded-xl border border-lime-500/30 bg-black/40 p-3', className)}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-lime-300/90">
          <Gift className="h-3.5 w-3.5" aria-hidden />
          {modeLabel} 경품 설정
        </div>
        <p className="text-[10px] tabular-nums text-zinc-500">
          {monthLabel}에만 저장됩니다. 다른 달과 별도입니다.
        </p>
      </div>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={'예: 상품권 1만원\n에너지젤 세트'}
        rows={3}
        className="resize-none border-zinc-700 bg-zinc-950 text-sm text-zinc-100"
        disabled={pending}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-zinc-400"
          disabled={pending}
          onClick={() => {
            setDraft(prizeText)
            setEditing(false)
          }}
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 bg-lime-500 text-black hover:bg-lime-400"
          disabled={pending}
          onClick={save}
        >
          {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          저장
        </Button>
      </div>
    </div>
  )
}
