'use client'

import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ArrowLeft, Loader2, Scale } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  addMemberBodyRecord,
  type MemberBodyRecord,
} from '@/lib/actions/member-body-records'
import { describeBodyRecordMigrationHint } from '@/lib/member-body-record-messages'
import { isBootstrapBodyRecord } from '@/lib/member-body-record-utils'
import { resolveRecordHeight } from '@/lib/member-body-analysis'
import { MemberBodyWeightChart } from '@/components/members/member-body-weight-chart'
import { MemberBodyMetricChart } from '@/components/members/member-body-metric-chart'
import { WeightWithDeltaText } from '@/components/members/weight-with-delta-text'
import {
  calculateHeightDeltaCm,
  formatHeightDeltaInParens,
  formatWeightDeltaInParens,
  heightDeltaTextClass,
  weightDeltaTextClass,
} from '@/lib/member-weight-delta'
import {
  calculateMemberBmi,
  formatBodyMetric,
  roundBodyMetric,
} from '@/lib/member-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

function formatRecordDate(value: string): string {
  try {
    return format(parseISO(value.slice(0, 10)), 'yyyy.M.d (EEE)', { locale: ko })
  } catch {
    return value
  }
}

function chartAxisLabel(value: string): string {
  try {
    return format(parseISO(value.slice(0, 10)), 'M/d', { locale: ko })
  } catch {
    return value.slice(5, 10)
  }
}

function showWeightDeltaToast(
  deltaKg: number | null,
  savedWeightKg: number,
  heightDeltaCm: number | null = null,
) {
  const deltaLabel = formatWeightDeltaInParens(deltaKg)
  const heightDeltaLabel = formatHeightDeltaInParens(heightDeltaCm)
  if (deltaLabel || heightDeltaLabel) {
    toast.success(
      <span className="font-semibold tabular-nums">
        {formatBodyMetric(savedWeightKg)}
        {deltaLabel ? (
          <span className={cn('ml-1', weightDeltaTextClass(deltaKg))}>{deltaLabel}</span>
        ) : null}
        {heightDeltaLabel ? (
          <span className={cn('ml-1.5', heightDeltaTextClass(heightDeltaCm))}>
            키 {heightDeltaLabel}
          </span>
        ) : null}
      </span>,
    )
    return
  }

  toast.success(`${formatBodyMetric(savedWeightKg)}kg 기록`)
}

export function MemberWeightPageView({
  memberId,
  memberName,
  memberSport,
  memberHeightCm = null,
  initialRecords,
  tableReady,
}: {
  memberId: string
  memberName: string
  memberSport?: string | null
  memberHeightCm?: number | null
  initialRecords: MemberBodyRecord[]
  tableReady: boolean
}) {
  const router = useRouter()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [records, setRecords] = useState(
    () =>
      [...initialRecords]
        .filter((record) => !isBootstrapBodyRecord(record))
        .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)),
  )
  const [baselineHeight, setBaselineHeight] = useState<number | null>(
    memberHeightCm,
  )
  const [recordedAt, setRecordedAt] = useState(today)
  const [weightDraft, setWeightDraft] = useState('')
  const [heightDraft, setHeightDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const memberLabel = memberSport?.trim()
    ? `${memberName}(${memberSport})`
    : memberName

  const recordsByDate = useMemo(() => {
    const map = new Map<string, MemberBodyRecord>()
    for (const record of records) {
      map.set(record.recorded_at, record)
    }
    return map
  }, [records])

  useEffect(() => {
    setBaselineHeight(memberHeightCm)
  }, [memberHeightCm])

  useEffect(() => {
    const existing = recordsByDate.get(recordedAt)
    if (existing) {
      setWeightDraft(formatBodyMetric(existing.weight_kg) ?? String(existing.weight_kg))
      // 키는 미입력 — 새로 입력할 때만 성장량 비교
      setHeightDraft('')
      return
    }
    setWeightDraft('')
    setHeightDraft('')
  }, [recordedAt, recordsByDate])

  const previewBmi = useMemo(() => {
    const weight = Number(weightDraft)
    const height = Number(heightDraft)
    return calculateMemberBmi(
      Number.isFinite(height) && height > 0 ? height : baselineHeight,
      Number.isFinite(weight) && weight > 0 ? weight : null,
    )
  }, [weightDraft, heightDraft, baselineHeight])

  const previewHeightDelta = useMemo(() => {
    const trimmed = heightDraft.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed <= 50 || parsed >= 250) return null
    return calculateHeightDeltaCm(baselineHeight, parsed)
  }, [heightDraft, baselineHeight])

  const chartRecordsAsc = useMemo(
    () => [...records].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)),
    [records],
  )

  const weightChartPoints = useMemo(
    () =>
      chartRecordsAsc.flatMap((record) => {
        const weight = roundBodyMetric(record.weight_kg)
        if (weight == null) return []
        return [
          {
            date: record.recorded_at,
            label: chartAxisLabel(record.recorded_at),
            weight,
          },
        ]
      }),
    [chartRecordsAsc],
  )

  const bmiChartPoints = useMemo(
    () =>
      chartRecordsAsc.flatMap((record) => {
        const height = resolveRecordHeight(baselineHeight, record.height_cm)
        const bmi = calculateMemberBmi(height, record.weight_kg)
        if (bmi == null) return []
        return [
          {
            date: record.recorded_at,
            label: chartAxisLabel(record.recorded_at),
            value: bmi,
          },
        ]
      }),
    [chartRecordsAsc, baselineHeight],
  )

  async function handleSave() {
    const parsed = Number(weightDraft.trim())
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 500) {
      toast.error('체중을 올바르게 입력해주세요.')
      return
    }

    const heightRaw = heightDraft.trim()
    let heightCm: number | null = null
    if (heightRaw) {
      const parsedHeight = Number(heightRaw)
      if (!Number.isFinite(parsedHeight) || parsedHeight <= 50 || parsedHeight >= 250) {
        toast.error('키를 올바르게 입력해주세요. (예: 170)')
        return
      }
      heightCm = parsedHeight
    }

    setSaving(true)
    try {
      const result = await addMemberBodyRecord(memberId, parsed, {
        recordedAt,
        heightCm: heightCm ?? undefined,
      })
      if (result.error) {
        const migration = describeBodyRecordMigrationHint(result.migrationHint)
        toast.error(migration?.title ?? '체중 기록 실패', {
          description: migration?.description ?? result.error,
        })
        return
      }

      if (result.record) {
        setRecords((current) => {
          const next = current.filter((row) => row.recorded_at !== result.record!.recorded_at)
          next.push(result.record!)
          return next.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
        })
        if (result.record.height_cm != null) {
          setBaselineHeight(result.record.height_cm)
        }
      }

      const savedWeight = result.record?.weight_kg ?? parsed
      const heightDelta =
        heightCm != null
          ? calculateHeightDeltaCm(baselineHeight, heightCm)
          : null
      showWeightDeltaToast(result.weightDeltaKg ?? null, savedWeight, heightDelta)
      setWeightDraft(formatBodyMetric(savedWeight) ?? String(savedWeight))
      setHeightDraft('')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 pt-12 lg:pt-0">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" asChild>
          <Link href={`/dashboard/members/${memberId}`} aria-label="회원 상세로">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 shrink-0 text-primary" />
            <h1 className="truncate text-xl font-bold text-foreground">{memberLabel}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">날짜별 체중·키·BMI 기록</p>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">체중 · 키 입력</h2>
        <div className="space-y-1.5">
          <Label htmlFor="weight-date">날짜</Label>
          <Input
            id="weight-date"
            type="date"
            value={recordedAt}
            disabled={saving}
            onChange={(event) => setRecordedAt(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="weight-kg">체중 (kg)</Label>
            <Input
              id="weight-kg"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="500"
              placeholder="체중"
              value={weightDraft}
              disabled={saving}
              onChange={(event) => setWeightDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleSave()
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="height-cm">키 (cm)</Label>
            <Input
              id="height-cm"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="250"
              placeholder="키"
              value={heightDraft}
              disabled={saving}
              onChange={(event) => setHeightDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleSave()
                }
              }}
            />
          </div>
        </div>
        {previewHeightDelta != null ? (
          <p className="text-sm text-muted-foreground">
            키 변화:{' '}
            <span
              className={cn(
                'font-semibold tabular-nums',
                heightDeltaTextClass(previewHeightDelta),
              )}
            >
              {formatHeightDeltaInParens(previewHeightDelta)}
            </span>
          </p>
        ) : null}
        {previewBmi != null ? (
          <p className="text-sm text-muted-foreground">
            BMI 자동 계산:{' '}
            <span className="font-semibold tabular-nums text-foreground">{previewBmi}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            키가 있으면 BMI가 자동으로 계산되어 이력·그래프에 반영됩니다.
          </p>
        )}
        {recordsByDate.has(recordedAt) ? (
          <p className="text-xs text-muted-foreground">
            이 날짜에 이미 기록이 있습니다. 저장하면 덮어씁니다.
          </p>
        ) : null}
        <Button
          type="button"
          className="w-full"
          disabled={saving || !tableReady}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '저장'}
        </Button>
        {!tableReady ? (
          <p className="text-xs text-destructive">
            DB: supabase/add-member-body-records.sql 실행 필요
          </p>
        ) : null}
      </section>

      {weightChartPoints.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">기록 그래프</h2>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs text-muted-foreground">체중</p>
              <MemberBodyWeightChart points={weightChartPoints} className="h-[220px] w-full" />
            </div>
            {bmiChartPoints.length > 0 ? (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">BMI (키 반영)</p>
                <MemberBodyMetricChart
                  points={bmiChartPoints}
                  metricKey="bmi"
                  metricLabel="BMI"
                  formatValue={(value) => {
                    const n = Number(value)
                    return Number.isFinite(n) ? n.toFixed(1) : '-'
                  }}
                  className="h-[220px] w-full"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                키를 입력하면 BMI 그래프가 함께 표시됩니다.
              </p>
            )}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">날짜별 기록</h2>
        {records.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            아직 체중 기록이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {records.map((record, index) => {
              const newer = records[index + 1]
              const currentWeight = roundBodyMetric(record.weight_kg)
              const previousWeight =
                newer != null ? roundBodyMetric(newer.weight_kg) : null
              const delta =
                currentWeight != null && previousWeight != null
                  ? Number((currentWeight - previousWeight).toFixed(1))
                  : null
              const weightValue = currentWeight
              if (weightValue == null) return null
              const height = resolveRecordHeight(baselineHeight, record.height_cm)
              const priorHeight =
                newer != null
                  ? resolveRecordHeight(baselineHeight, newer.height_cm)
                  : null
              const heightDelta =
                record.height_cm != null
                  ? calculateHeightDeltaCm(
                      priorHeight,
                      Number(record.height_cm),
                    )
                  : null
              const bmi = calculateMemberBmi(height, weightValue)
              const heightDeltaLabel = formatHeightDeltaInParens(heightDelta)

              return (
                <li
                  key={record.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {formatRecordDate(record.recorded_at)}
                    </p>
                    {height != null ? (
                      <p className="text-xs text-muted-foreground">
                        키 {formatBodyMetric(height)}cm
                        {heightDeltaLabel ? (
                          <span
                            className={cn(
                              'ml-1 font-medium tabular-nums',
                              heightDeltaTextClass(heightDelta),
                            )}
                          >
                            {heightDeltaLabel}
                          </span>
                        ) : null}
                        {bmi != null ? ` · BMI ${bmi}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <WeightWithDeltaText
                    weightKg={weightValue}
                    deltaKg={delta}
                    className="text-sm font-semibold"
                    showKgSuffix
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
