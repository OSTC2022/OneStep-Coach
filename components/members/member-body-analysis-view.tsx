'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  Activity,
  ArrowLeft,
  Loader2,
  Scale,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  addMemberBodyRecord,
  deleteMemberBodyRecord,
  type MemberBodyRecord,
} from '@/lib/actions/member-body-records'
import { buildBodyAnalysisStats } from '@/lib/member-body-analysis'
import { calculateMemberBmi, resolveMemberBmi } from '@/lib/member-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

const MemberBodyWeightChart = dynamic(
  () =>
    import('@/components/members/member-body-weight-chart').then((mod) => ({
      default: mod.MemberBodyWeightChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/15 text-sm text-muted-foreground">
        그래프 불러오는 중…
      </div>
    ),
  },
)

interface MemberBodyAnalysisViewProps {
  member: {
    id: string
    name: string
    sport: string | null
    height_cm: number | null
    weight_kg: number | null
    bmi: number | null
  }
  initialRecords: MemberBodyRecord[]
  tableReady: boolean
}

function formatRecordDate(date: string) {
  return format(parseISO(date), 'yyyy.M.d (EEE)', { locale: ko })
}

export function MemberBodyAnalysisView({
  member,
  initialRecords,
  tableReady,
}: MemberBodyAnalysisViewProps) {
  const [records, setRecords] = useState(initialRecords)
  const [dateInput, setDateInput] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [weightInput, setWeightInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MemberBodyRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const stats = useMemo(
    () => buildBodyAnalysisStats(records, member.height_cm),
    [records, member.height_cm],
  )

  const chartPoints = useMemo(
    () =>
      records.map((record) => ({
        date: record.recorded_at,
        label: format(parseISO(record.recorded_at), 'M/d', { locale: ko }),
        weight: record.weight_kg,
      })),
    [records],
  )

  const displayBmi = resolveMemberBmi({
    bmi: stats.latestBmi ?? member.bmi,
    height_cm: member.height_cm,
    weight_kg: stats.latest ?? member.weight_kg,
  })

  async function handleAddWeight() {
    if (!dateInput) {
      toast.error('날짜를 선택해주세요.')
      return
    }

    const weight = Number(weightInput)
    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error('체중을 입력해주세요.')
      return
    }

    setSaving(true)
    const result = await addMemberBodyRecord(member.id, weight, {
      recordedAt: dateInput,
      heightCm: member.height_cm,
    })
    setSaving(false)

    if (result.error) {
      toast.error('체중 기록 실패', {
        description: result.migrationHint
          ? `${result.error} · ${result.migrationHint}`
          : result.error,
      })
      return
    }

    if (result.record) {
      setRecords((prev) => {
        const withoutSameDay = prev.filter(
          (row) => row.recorded_at !== result.record!.recorded_at,
        )
        return [...withoutSameDay, result.record!].sort((a, b) =>
          a.recorded_at.localeCompare(b.recorded_at),
        )
      })
      setWeightInput('')
      toast.success('체중이 기록되었습니다.', {
        description: formatRecordDate(result.record.recorded_at),
      })
    }
  }

  async function handleDeleteRecord() {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteMemberBodyRecord(deleteTarget.id, member.id)
    setDeleting(false)

    if (result.error) {
      toast.error('삭제 실패', { description: result.error })
      return
    }

    setRecords((prev) => prev.filter((row) => row.id !== deleteTarget.id))
    setDeleteTarget(null)
    toast.success('체중 기록을 삭제했습니다.')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href={`/dashboard/members/${member.id}`}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Body Performance
            </p>
            <h1 className="text-2xl font-bold lg:text-3xl">{member.name} 신체 변화</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              수업현황 체중 입력이 자동 반영됩니다
              {member.sport ? ` · ${member.sport}` : ''}
            </p>
          </div>
        </div>
        {!tableReady ? (
          <p className="text-xs text-amber-400">
            DB: supabase/add-member-body-records.sql 실행 필요
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">현재 체중</p>
            <p className="text-2xl font-bold tabular-nums">
              {stats.latest != null ? `${stats.latest}kg` : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">변화량</p>
            <p
              className={cn(
                'inline-flex items-center gap-1 text-2xl font-bold tabular-nums',
                stats.delta == null
                  ? ''
                  : stats.delta > 0
                    ? 'text-amber-300'
                    : stats.delta < 0
                      ? 'text-sky-300'
                      : '',
              )}
            >
              {stats.delta == null ? (
                '-'
              ) : (
                <>
                  {stats.delta > 0 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : stats.delta < 0 ? (
                    <TrendingDown className="h-5 w-5" />
                  ) : null}
                  {stats.delta > 0 ? '+' : ''}
                  {stats.delta}kg
                </>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">평균 · 최저 · 최고</p>
            <p className="text-lg font-semibold tabular-nums">
              {stats.average ?? '-'} / {stats.min ?? '-'} / {stats.max ?? '-'} kg
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">BMI</p>
            <p className="text-2xl font-bold tabular-nums text-primary">
              {displayBmi != null ? displayBmi.toFixed(1) : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b border-border/60 bg-gradient-to-r from-primary/10 to-transparent">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            체중 변화 그래프
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {chartPoints.length > 0 ? (
            <MemberBodyWeightChart points={chartPoints} className="h-[320px]" />
          ) : (
            <div className="flex h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
              <Scale className="mb-3 h-10 w-10 text-primary/40" />
              <p>아직 체중 기록이 없습니다.</p>
              <p className="mt-1 text-xs">수업현황에서 체중을 입력하거나 아래에서 직접 기록하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">기록 이력</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {records.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                기록이 없습니다.
              </p>
            ) : (
              [...records].reverse().map((record) => {
                const canDelete = !record.id.startsWith('bootstrap-')
                return (
                  <div
                    key={record.id}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/15 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {formatRecordDate(record.recorded_at)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {record.weight_kg}kg
                        {member.height_cm
                          ? ` · BMI ${calculateMemberBmi(member.height_cm, record.weight_kg)?.toFixed(1) ?? '-'}`
                          : ''}
                      </p>
                    </div>
                    {canDelete ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(record)}
                        aria-label="체중 기록 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">체중 직접 기록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="body-record-date" className="text-xs text-muted-foreground">
                날짜
              </Label>
              <KoreanDatePicker
                id="body-record-date"
                value={dateInput}
                onChange={setDateInput}
                placeholder="날짜 선택"
                compact
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body-record-weight" className="text-xs text-muted-foreground">
                체중
              </Label>
              <Input
                id="body-record-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                max="500"
                placeholder="체중 (kg)"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                disabled={saving}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleAddWeight()
                  }
                }}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={saving}
              onClick={() => void handleAddWeight()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중
                </>
              ) : (
                '기록하기'
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              같은 날짜에 다시 기록하면 체중이 갱신됩니다. 수업현황 선수 카드 입력도
              해당 수업 날짜로 자동 반영됩니다.
            </p>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>체중 기록을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${formatRecordDate(deleteTarget.recorded_at)} · ${deleteTarget.weight_kg}kg 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
                : '선택한 체중 기록을 삭제합니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDeleteRecord()}
            >
              {deleting ? '삭제 중…' : '삭제'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
