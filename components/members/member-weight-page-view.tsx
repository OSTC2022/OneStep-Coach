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
import { WeightWithDeltaText } from '@/components/members/weight-with-delta-text'
import {
  formatWeightDeltaInParens,
  weightDeltaTextClass,
} from '@/lib/member-weight-delta'
import { formatBodyMetric, roundBodyMetric } from '@/lib/member-utils'
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

function showWeightDeltaToast(deltaKg: number | null, savedWeightKg: number) {
  const deltaLabel = formatWeightDeltaInParens(deltaKg)
  if (deltaLabel) {
    toast.success(
      <span className="font-semibold tabular-nums">
        {formatBodyMetric(savedWeightKg)}
        <span className={cn('ml-1', weightDeltaTextClass(deltaKg))}>{deltaLabel}</span>
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
  initialRecords,
  tableReady,
}: {
  memberId: string
  memberName: string
  memberSport?: string | null
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
  const [recordedAt, setRecordedAt] = useState(today)
  const [weightDraft, setWeightDraft] = useState('')
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
    const existing = recordsByDate.get(recordedAt)
    if (existing) {
      setWeightDraft(formatBodyMetric(existing.weight_kg) ?? String(existing.weight_kg))
      return
    }
    setWeightDraft('')
  }, [recordedAt, recordsByDate])

  async function handleSave() {
    const parsed = Number(weightDraft.trim())
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 500) {
      toast.error('체중을 올바르게 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const result = await addMemberBodyRecord(memberId, parsed, { recordedAt })
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
      }

      const savedWeight = result.record?.weight_kg ?? parsed
      showWeightDeltaToast(result.weightDeltaKg ?? null, savedWeight)
      setWeightDraft(formatBodyMetric(savedWeight) ?? String(savedWeight))
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
          <p className="mt-1 text-sm text-muted-foreground">날짜별 체중 기록</p>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">체중 입력</h2>
        <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="space-y-1.5">
            <Label htmlFor="weight-kg">체중 (kg)</Label>
            <Input
              id="weight-kg"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="500"
              placeholder="예: 65.5"
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
        </div>
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
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '체중 저장'}
        </Button>
        {!tableReady ? (
          <p className="text-xs text-destructive">
            DB: supabase/add-member-body-records.sql 실행 필요
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">날짜별 체중</h2>
        {records.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            아직 체중 기록이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {records.map((record, index) => {
              const newer = records[index + 1]
              const delta =
                newer != null
                  ? Number(
                      (
                        (roundBodyMetric(record.weight_kg) ?? record.weight_kg) -
                        (roundBodyMetric(newer.weight_kg) ?? newer.weight_kg)
                      ).toFixed(1),
                    )
                  : null
              const weightValue = roundBodyMetric(record.weight_kg) ?? record.weight_kg

              return (
                <li
                  key={record.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {formatRecordDate(record.recorded_at)}
                    </p>
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
