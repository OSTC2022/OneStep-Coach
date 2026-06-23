'use client'

import { useMemo } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import {
  analyzeRecordChange,
  formatRecordDeltaLabel,
  formatSecondsToRunningTime,
} from '@/lib/running-league/records'
import type { RunningLeagueDistanceEvent } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const DISTANCE_EVENTS: RunningLeagueDistanceEvent[] = ['1km', '3km', '5km', '10km']

interface RecordMeasurementPanelProps {
  distance: RunningLeagueDistanceEvent
  monthStart: string
  monthEnd: string
  coachMemo?: string
  recordScore?: number
  onDistanceChange?: (value: RunningLeagueDistanceEvent) => void
  onMonthStartChange?: (value: string) => void
  onMonthEndChange?: (value: string) => void
  onCoachMemoChange?: (value: string) => void
  onRecordScoreChange?: (value: number) => void
  onSave?: () => void
  saveLabel?: string
  pending?: boolean
  readOnly?: boolean
  /** 회원 화면: 점수·관리자용 수치 숨김 */
  memberView?: boolean
}

export function RecordMeasurementPanel({
  distance,
  monthStart,
  monthEnd,
  coachMemo = '',
  recordScore,
  onDistanceChange,
  onMonthStartChange,
  onMonthEndChange,
  onCoachMemoChange,
  onRecordScoreChange,
  onSave,
  saveLabel = '기록 저장',
  pending = false,
  readOnly = false,
  memberView = false,
}: RecordMeasurementPanelProps) {
  const analysis = useMemo(
    () => analyzeRecordChange(monthStart, monthEnd, distance),
    [monthStart, monthEnd, distance],
  )

  const displayScore = recordScore ?? analysis.score

  return (
    <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">측정 종목</Label>
          {readOnly ? (
            <p className="flex h-9 items-center text-sm font-medium">{distance}</p>
          ) : onDistanceChange ? (
            <Select value={distance} onValueChange={(v) => onDistanceChange(v as RunningLeagueDistanceEvent)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISTANCE_EVENTS.map((event) => (
                  <SelectItem key={event} value={event}>
                    {event}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">월초 기록</Label>
          {readOnly ? (
            <p className="flex h-9 items-center text-sm font-medium">{monthStart || '—'}</p>
          ) : onMonthStartChange ? (
            <Input
              className="h-9"
              placeholder="32:10 또는 1:02:30"
              value={monthStart}
              onChange={(e) => onMonthStartChange(e.target.value)}
            />
          ) : null}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">월말 기록</Label>
          {readOnly ? (
            <p className="flex h-9 items-center text-sm font-medium">{monthEnd || '—'}</p>
          ) : onMonthEndChange ? (
            <Input
              className="h-9"
              placeholder="30:45"
              value={monthEnd}
              onChange={(e) => onMonthEndChange(e.target.value)}
            />
          ) : null}
        </div>
      </div>

      {analysis.status !== 'incomplete' ? (
        <div
          className={cn(
            'grid gap-2 rounded-md border px-3 py-2 text-sm sm:grid-cols-2 lg:grid-cols-4',
            analysis.status === 'improved' && 'border-emerald-500/30 bg-emerald-500/5',
            analysis.status === 'declined' && 'border-amber-500/30 bg-amber-500/5',
            analysis.status === 'unchanged' && 'border-border bg-background/50',
          )}
        >
          <div>
            <p className="text-[10px] text-muted-foreground">변화</p>
            <p className="font-medium">
              {analysis.deltaLabel ??
                (analysis.deltaSeconds != null
                  ? formatRecordDeltaLabel(analysis.deltaSeconds)
                  : '—')}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">향상 여부</p>
            <p className="flex items-center gap-1 font-medium">
              {analysis.status === 'improved' ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              ) : analysis.status === 'declined' ? (
                <TrendingDown className="h-3.5 w-3.5 text-amber-400" />
              ) : null}
              {analysis.statusLabel}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">향상률</p>
            <p className="font-medium">
              {analysis.improvementRatePercent != null
                ? `${analysis.improvementRatePercent > 0 ? '+' : ''}${analysis.improvementRatePercent}%`
                : '—'}
            </p>
          </div>
          {!memberView ? (
            <div>
              <p className="text-[10px] text-muted-foreground">기록 향상 점수</p>
              <p className="font-medium text-primary">{displayScore}점</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {analysis.monthStartSeconds != null && analysis.monthEndSeconds != null ? (
        <p className="text-[11px] text-muted-foreground">
          {distance} · 월초 {formatSecondsToRunningTime(analysis.monthStartSeconds)} → 월말{' '}
          {formatSecondsToRunningTime(analysis.monthEndSeconds)}
        </p>
      ) : null}

      {onCoachMemoChange ? (
        <div className="space-y-1">
          <Label className="text-xs">코치 메모</Label>
          <Textarea
            value={coachMemo}
            onChange={(e) => onCoachMemoChange(e.target.value)}
            rows={2}
            placeholder="기록 측정·페이스 피드백"
            disabled={readOnly}
          />
        </div>
      ) : coachMemo ? (
        <div className="space-y-1">
          <Label className="text-xs">코치 메모</Label>
          <p className="rounded-md border bg-background/60 px-3 py-2 text-sm">{coachMemo}</p>
        </div>
      ) : null}

      {!readOnly && onRecordScoreChange ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">기록 향상 점수 (수동 조정)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              className="h-9"
              value={displayScore}
              onChange={(e) => onRecordScoreChange(Number(e.target.value))}
            />
          </div>
        </div>
      ) : null}

      {!readOnly && onSave ? (
        <Button type="button" size="sm" variant="outline" onClick={onSave} disabled={pending}>
          {saveLabel}
        </Button>
      ) : null}
    </div>
  )
}
