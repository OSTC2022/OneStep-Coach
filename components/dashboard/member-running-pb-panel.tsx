'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import { saveMemberRunningPb } from '@/lib/actions/running-league'
import type {
  RunningLeagueDistanceEvent,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const DISTANCE_EVENTS: RunningLeagueDistanceEvent[] = ['10km', 'half', 'full']

const DISTANCE_LABELS: Record<(typeof DISTANCE_EVENTS)[number], string> = {
  '10km': '10km',
  half: 'Half (하프)',
  full: 'Full (풀)',
}

interface MemberRunningPbPanelProps {
  participant: RunningLeagueParticipant | null
  pbRecords: RunningLeagueRecord[]
  tableReady: boolean
  readOnly?: boolean
  variant?: 'default' | 'embedded'
}

export type MemberRunningPbDialogProps = {
  participant: RunningLeagueParticipant | null
  pbRecords: RunningLeagueRecord[]
  tableReady: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  readOnly?: boolean
  portalRecordReady?: boolean
  initialDistance?: RunningLeagueDistanceEvent
}

function PbSectionLabel({ embedded }: { embedded?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 font-medium leading-none text-muted-foreground',
        embedded ? 'text-sm' : 'text-xs',
      )}
    >
      {embedded ? <span className="inline-flex h-4 w-4 shrink-0" aria-hidden /> : null}
      <span>개인 러닝 PB</span>
    </div>
  )
}

function resolvePortalDistance(distance: RunningLeagueDistanceEvent): (typeof DISTANCE_EVENTS)[number] {
  return (DISTANCE_EVENTS as readonly RunningLeagueDistanceEvent[]).includes(distance)
    ? (distance as (typeof DISTANCE_EVENTS)[number])
    : '10km'
}

function useMemberRunningPbForm(
  participant: RunningLeagueParticipant | null,
  initialDistance: RunningLeagueDistanceEvent = '10km',
) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [distance, setDistance] = useState<(typeof DISTANCE_EVENTS)[number]>(() =>
    resolvePortalDistance(initialDistance),
  )
  const [timeText, setTimeText] = useState('')
  const [measuredAt, setMeasuredAt] = useState(new Date().toISOString().slice(0, 10))

  function handleSave(onSuccess?: () => void) {
    if (!timeText.trim()) {
      toast.error('기록을 입력해주세요.')
      return
    }

    startTransition(async () => {
      const result = await saveMemberRunningPb({
        distance_event: distance,
        time_text: timeText.trim(),
        measured_at: measuredAt,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('개인 PB가 저장되었습니다.')
      setTimeText('')
      onSuccess?.()
      router.refresh()
    })
  }

  return {
    distance,
    setDistance,
    timeText,
    setTimeText,
    measuredAt,
    setMeasuredAt,
    pending,
    handleSave,
  }
}

function RunningPbFormFields({
  distance,
  setDistance,
  timeText,
  setTimeText,
  measuredAt,
  setMeasuredAt,
  pending,
  onSave,
  onCancel,
  saveLabel = 'PB 저장',
}: {
  distance: (typeof DISTANCE_EVENTS)[number]
  setDistance: (value: (typeof DISTANCE_EVENTS)[number]) => void
  timeText: string
  setTimeText: (value: string) => void
  measuredAt: string
  setMeasuredAt: (value: string) => void
  pending: boolean
  onSave: () => void
  onCancel?: () => void
  saveLabel?: string
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">종목</Label>
          <Select value={distance} onValueChange={(value) => setDistance(value as (typeof DISTANCE_EVENTS)[number])}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISTANCE_EVENTS.map((event) => (
                <SelectItem key={event} value={event}>
                  {DISTANCE_LABELS[event]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">기록</Label>
          <Input
            className="h-9"
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            placeholder="32:10"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">측정일</Label>
        <KoreanDatePicker value={measuredAt} onChange={setMeasuredAt} compact placeholder="날짜 선택" />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" className="h-9 flex-1" disabled={pending} onClick={onSave}>
          {pending ? '저장 중…' : saveLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" className="h-9" disabled={pending} onClick={onCancel}>
            닫기
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function MemberRunningPbDialog({
  participant,
  pbRecords,
  tableReady,
  open,
  onOpenChange,
  readOnly = false,
  portalRecordReady = false,
  initialDistance = '10km',
}: MemberRunningPbDialogProps) {
  const form = useMemberRunningPbForm(participant, initialDistance)
  const hasPb = pbRecords.some((record) => record.time_text?.trim())
  const canRecord = Boolean(participant) || portalRecordReady

  useEffect(() => {
    if (open) {
      form.setDistance(resolvePortalDistance(initialDistance))
    }
  }, [open, initialDistance, form])

  if (!tableReady || readOnly) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="max-h-[90dvh] gap-3 overflow-y-auto sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>PB {hasPb ? '수정' : '등록'}</DialogTitle>
        </DialogHeader>
        {!canRecord ? (
          <p className="text-sm text-muted-foreground">PB를 등록할 수 없습니다.</p>
        ) : (
          <RunningPbFormFields
            {...form}
            onSave={() => form.handleSave(() => onOpenChange(false))}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

export function MemberRunningPbPanel({
  participant,
  pbRecords,
  tableReady,
  readOnly = false,
  variant = 'default',
}: MemberRunningPbPanelProps) {
  const embedded = variant === 'embedded'
  const [open, setOpen] = useState(false)
  const form = useMemberRunningPbForm(participant)

  const pbByDistance = useMemo(() => {
    const map = new Map<RunningLeagueDistanceEvent, RunningLeagueRecord>()
    for (const record of pbRecords) {
      map.set(record.distance_event, record)
    }
    return map
  }, [pbRecords])

  const primaryPb =
    pbByDistance.get('10km') ??
    pbByDistance.get('half') ??
    pbByDistance.get('full') ??
    pbRecords[0] ??
    null

  if (!tableReady) {
    return (
      <div className={cn(embedded && 'space-y-2')}>
        <PbSectionLabel embedded={embedded} />
        <p className="mt-2 text-sm text-muted-foreground">DB 설정이 필요합니다.</p>
      </div>
    )
  }

  if (!participant) {
    return (
      <div className={cn(embedded && 'space-y-2')}>
        <PbSectionLabel embedded={embedded} />
        <p className="mt-2 text-sm text-muted-foreground">러닝 리그 참가 후 기록할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className={cn(embedded ? 'space-y-2' : 'space-y-2')}>
      <PbSectionLabel embedded={embedded} />
      {primaryPb?.time_text ? (
        <div className="mt-2">
          <p className="text-2xl font-bold leading-none text-primary lg:text-3xl">
            {primaryPb.distance_event} {primaryPb.time_text}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {format(parseISO(primaryPb.measured_at), 'yyyy.M.d (EEE)', { locale: ko })} 기록
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">아직 등록된 PB가 없습니다.</p>
      )}

      {pbRecords.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {DISTANCE_EVENTS.map((event) => {
            const record = pbByDistance.get(event)
            if (!record?.time_text) return null
            return (
              <span
                key={event}
                className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {event} {record.time_text}
              </span>
            )
          })}
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-2.5">
          <RunningPbFormFields
            {...form}
            onSave={() => form.handleSave(() => setOpen(false))}
            onCancel={() => setOpen(false)}
          />
        </div>
      ) : readOnly ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full border-primary/30 bg-background/50 text-xs sm:w-auto"
          onClick={() => setOpen(true)}
        >
          PB {primaryPb ? '수정' : '등록'}
        </Button>
      )}
    </div>
  )
}
