'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import { format, parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getLessonCompletionMemberInsight,
  recordLessonStatusWeight,
} from '@/lib/actions/member-body-records'
import { MemberBodyMetricChart } from '@/components/members/member-body-metric-chart'
import {
  calculateHeightDeltaCm,
  calculateWeightDeltaKg,
  formatHeightDeltaInParens,
  formatWeightDeltaInParens,
  heightDeltaTextClass,
  weightDeltaTextClass,
} from '@/lib/member-weight-delta'
import { formatBodyMetric } from '@/lib/member-utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type LessonCompletionMemberInsightHandle = {
  /** 서명 확정 전 미저장 입력 반영. false면 확정 중단 */
  savePending: () => Promise<boolean>
}

type InsightRecord = {
  date: string
  weightKg: number
  heightCm: number | null
  bmi: number | null
  maxSpeedKmh: number | null
}

type LessonCompletionMemberInsightProps = {
  memberId: string
  lessonDate: string
  remainingSessions: number | null
  className?: string
  onBodySaved?: (payload: {
    weightKg: number
    deltaKg: number | null
    heightCm: number | null
    maxSpeedKmh: number | null
  }) => void
}

function chartLabel(date: string) {
  try {
    return format(parseISO(date.slice(0, 10)), 'M/d')
  } catch {
    return date.slice(5, 10)
  }
}

function formatRemainingPreview(remaining: number | null): string {
  if (remaining == null || !Number.isFinite(remaining)) {
    return '수업권 확인 필요'
  }
  if (remaining < 0) return `수업권 ${Math.abs(remaining)}회 초과`
  const after = remaining - 1
  if (after < 0) return `현재 ${remaining}회 · 종료 후 초과`
  return `현재 ${remaining}회 · 종료 후 ${after}회`
}

export const LessonCompletionMemberInsight = forwardRef<
  LessonCompletionMemberInsightHandle,
  LessonCompletionMemberInsightProps
>(function LessonCompletionMemberInsight(
  { memberId, lessonDate, remainingSessions, className, onBodySaved },
  ref,
) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<InsightRecord[]>([])
  const [resolvedRemaining, setResolvedRemaining] = useState<number | null>(
    remainingSessions,
  )
  const [weightDraft, setWeightDraft] = useState('')
  const [heightDraft, setHeightDraft] = useState('')
  const [speedDraft, setSpeedDraft] = useState('')
  const [baselineHeightCm, setBaselineHeightCm] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setResolvedRemaining(remainingSessions)
  }, [remainingSessions, memberId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getLessonCompletionMemberInsight(memberId, lessonDate).then((data) => {
      if (cancelled) return
      setRecords(data.records)
      setBaselineHeightCm(data.baselineHeightCm)
      if (data.remainingSessions != null && Number.isFinite(data.remainingSessions)) {
        setResolvedRemaining(data.remainingSessions)
      }
      setWeightDraft(
        data.todayWeightKg != null ? formatBodyMetric(data.todayWeightKg) : '',
      )
      setHeightDraft(
        data.todayHeightCm != null ? formatBodyMetric(data.todayHeightCm) : '',
      )
      setSpeedDraft(
        data.todayMaxSpeedKmh != null ? String(data.todayMaxSpeedKmh) : '',
      )
      setDirty(false)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [memberId, lessonDate])

  const weightPoints = useMemo(
    () =>
      records.map((row) => ({
        date: row.date,
        label: chartLabel(row.date),
        value: row.weightKg,
      })),
    [records],
  )
  const heightPoints = useMemo(
    () =>
      records
        .filter((row) => row.heightCm != null && row.heightCm > 0)
        .map((row) => ({
          date: row.date,
          label: chartLabel(row.date),
          value: row.heightCm as number,
        })),
    [records],
  )
  const bmiPoints = useMemo(
    () =>
      records
        .filter((row) => row.bmi != null)
        .map((row) => ({
          date: row.date,
          label: chartLabel(row.date),
          value: row.bmi as number,
        })),
    [records],
  )
  const speedPoints = useMemo(
    () =>
      records
        .filter((row) => row.maxSpeedKmh != null && row.maxSpeedKmh > 0)
        .map((row) => ({
          date: row.date,
          label: chartLabel(row.date),
          value: row.maxSpeedKmh as number,
        })),
    [records],
  )

  const latest = records[records.length - 1] ?? null
  const previous = records.length > 1 ? records[records.length - 2] : null
  const weightDelta =
    latest && previous
      ? calculateWeightDeltaKg(
          [
            { recorded_at: previous.date, weight_kg: previous.weightKg },
            { recorded_at: latest.date, weight_kg: latest.weightKg },
          ],
          latest.date,
          latest.weightKg,
        )
      : null
  const heightDelta =
    latest?.heightCm != null
      ? calculateHeightDeltaCm(
          previous?.heightCm ?? baselineHeightCm,
          latest.heightCm,
        )
      : null

  async function savePending(): Promise<boolean> {
    if (!dirty) return true

    const weight = Number(weightDraft.trim())
    if (!Number.isFinite(weight) || weight <= 0 || weight >= 500) {
      toast.error('체중을 올바르게 입력해주세요.')
      return false
    }

    const heightTrimmed = heightDraft.trim()
    const heightParsed = heightTrimmed ? Number(heightTrimmed) : NaN
    const heightCm =
      heightTrimmed &&
      Number.isFinite(heightParsed) &&
      heightParsed > 50 &&
      heightParsed < 250
        ? heightParsed
        : null
    if (heightTrimmed && heightCm == null) {
      toast.error('키를 올바르게 입력해주세요. (예: 170)')
      return false
    }

    const speedTrimmed = speedDraft.trim()
    const speedParsed = speedTrimmed ? Number(speedTrimmed) : NaN
    let maxSpeedKmh: number | null | undefined = undefined
    if (speedTrimmed) {
      if (!Number.isFinite(speedParsed) || speedParsed <= 0 || speedParsed >= 100) {
        toast.error('최대 시속을 올바르게 입력해주세요. (예: 28.5)')
        return false
      }
      maxSpeedKmh = Number(speedParsed.toFixed(1))
    }

    setSaving(true)
    const result = await recordLessonStatusWeight(
      memberId,
      lessonDate,
      weight,
      heightCm,
      maxSpeedKmh,
    )
    setSaving(false)

    if (result.error) {
      toast.error('신체 기록 저장 실패', {
        description: result.migrationHint
          ? `${result.error} · ${result.migrationHint}`
          : result.error,
      })
      return false
    }

    setDirty(false)
    onBodySaved?.({
      weightKg: result.savedWeightKg ?? weight,
      deltaKg: result.weightDeltaKg ?? null,
      heightCm: result.savedHeightCm ?? heightCm,
      maxSpeedKmh: result.savedMaxSpeedKmh ?? maxSpeedKmh ?? null,
    })

    // refresh charts
    const refreshed = await getLessonCompletionMemberInsight(memberId, lessonDate)
    setRecords(refreshed.records)
    return true
  }

  useImperativeHandle(ref, () => ({ savePending }), [
    dirty,
    weightDraft,
    heightDraft,
    speedDraft,
    memberId,
    lessonDate,
    onBodySaved,
  ])

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col gap-2 rounded-xl bg-primary/[0.04] p-2 sm:gap-3 sm:p-3',
        className,
      )}
    >
      <div className="shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2.5">
        <p className="text-lg font-semibold tabular-nums leading-snug text-foreground sm:text-xl">
          {formatRemainingPreview(resolvedRemaining)}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
            <MiniMetric
              title="체중"
              latest={
                latest
                  ? `${formatBodyMetric(latest.weightKg)}kg`
                  : '-'
              }
              delta={formatWeightDeltaInParens(weightDelta)}
              deltaClassName={weightDeltaTextClass(weightDelta)}
              points={weightPoints}
              metricKey="weight"
              metricLabel="체중"
              unit="kg"
              formatValue={(v) => `${formatBodyMetric(v)}kg`}
            />
            <MiniMetric
              title="키"
              latest={
                latest?.heightCm != null
                  ? `${formatBodyMetric(latest.heightCm)}cm`
                  : '-'
              }
              delta={formatHeightDeltaInParens(heightDelta)}
              deltaClassName={heightDeltaTextClass(heightDelta)}
              points={heightPoints}
              metricKey="height"
              metricLabel="키"
              unit="cm"
              formatValue={(v) => `${formatBodyMetric(v)}cm`}
            />
            <MiniMetric
              title="BMI"
              latest={latest?.bmi != null ? latest.bmi.toFixed(1) : '-'}
              points={bmiPoints}
              metricKey="bmi"
              metricLabel="BMI"
              formatValue={(v) => v.toFixed(1)}
            />
            <MiniMetric
              title="최대시속"
              latest={
                latest?.maxSpeedKmh != null ? `${latest.maxSpeedKmh}` : '-'
              }
              points={speedPoints}
              metricKey="maxSpeed"
              metricLabel="시속"
              unit=""
              formatValue={(v) => String(v)}
              staffOnly
            />
          </div>

          <div className="shrink-0 space-y-2 border-t border-border/60 pt-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              오늘 기록 (종료 전 입력)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="completion-weight" className="text-[11px]">
                  체중
                </Label>
                <Input
                  id="completion-weight"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="kg"
                  value={weightDraft}
                  disabled={saving}
                  className="h-9 tabular-nums"
                  onChange={(e) => {
                    setWeightDraft(e.target.value)
                    setDirty(true)
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="completion-height" className="text-[11px]">
                  키
                </Label>
                <Input
                  id="completion-height"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="cm"
                  value={heightDraft}
                  disabled={saving}
                  className="h-9 tabular-nums"
                  onChange={(e) => {
                    setHeightDraft(e.target.value)
                    setDirty(true)
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="completion-speed" className="text-[11px]">
                  최대시속
                </Label>
                <Input
                  id="completion-speed"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="km/h"
                  value={speedDraft}
                  disabled={saving}
                  className="h-9 tabular-nums"
                  onChange={(e) => {
                    setSpeedDraft(e.target.value)
                    setDirty(true)
                  }}
                />
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              최대시속은 강사·관리자 화면에서만 보이며, 회원·보호자 포털에는 표시되지
              않습니다.
            </p>
          </div>
        </>
      )}
    </div>
  )
})

function MiniMetric({
  title,
  latest,
  delta,
  deltaClassName,
  points,
  metricKey,
  metricLabel,
  unit,
  formatValue,
  staffOnly,
}: {
  title: string
  latest: string
  delta?: string | null
  deltaClassName?: string
  points: Array<{ date: string; label: string; value: number }>
  metricKey: string
  metricLabel: string
  unit?: string
  formatValue?: (value: number) => string
  staffOnly?: boolean
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-border/70 bg-background/60 p-2">
      <div className="flex shrink-0 items-baseline justify-between gap-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          {title}
          {staffOnly ? (
            <span className="ml-1 text-[9px] text-muted-foreground/70">내부</span>
          ) : null}
        </p>
        <p className="truncate text-sm font-semibold tabular-nums sm:text-base">
          {latest}
          {delta ? (
            <span className={cn('ml-1', deltaClassName)}>{delta}</span>
          ) : null}
        </p>
      </div>
      {points.length >= 2 ? (
        <MemberBodyMetricChart
          points={points}
          metricKey={metricKey}
          metricLabel={metricLabel}
          unit={unit}
          formatValue={formatValue}
          showPreviousDelta
          className="mt-1 min-h-[4.5rem] w-full flex-1 !aspect-auto"
        />
      ) : (
        <p className="mt-2 flex flex-1 items-center justify-center py-3 text-center text-[10px] text-muted-foreground">
          기록 부족
        </p>
      )}
    </div>
  )
}
