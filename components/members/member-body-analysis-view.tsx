'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  Activity,
  ArrowLeft,
  CalendarRange,
  ClipboardCheck,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Scale,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  addMemberBodyRecord,
  deleteMemberBodyRecord,
  type MemberBodyRecord,
} from '@/lib/actions/member-body-records'
import { updateMemberBodyBaseline } from '@/lib/actions/members'
import { describeBodyRecordMigrationHint } from '@/lib/member-body-record-messages'
import { isBootstrapBodyRecord } from '@/lib/member-body-record-utils'
import {
  buildBodyAnalysisStats,
  buildChartAxisDateLabel,
  buildCoachCheckReport,
  buildConditionChartPoints,
  buildPainChartPoints,
  buildRecentWeightChange,
  buildSleepChartPoints,
  CHART_TREND_INITIAL_NOTICE,
  chartSpanYears,
  chartTabAvailability,
  shouldShowChartTrendNotice,
  COACH_CHECK_STATUS_LABELS,
  coachCheckStatusClasses,
  conditionStatusToneClass,
  filterRecordsByPeriod,
  getGrowthStatus,
  getLatestConditionStatus,
  prepareRecordsForChart,
  resolveBodyChartGranularity,
  resolveRecordHeight,
  wellnessSummaryToneClass,
} from '@/lib/member-body-analysis'
import {
  BODY_CHART_GRANULARITY_WEEKS,
  BODY_PERIOD_PRESETS,
  DEFAULT_BODY_PERIOD_SETTINGS,
  bodyPeriodSettingsEqual,
  clearBodyPeriodSettings,
  defaultBodyGranularityRange,
  formatBodyPeriodLabel,
  isBodyGranularityMode,
  loadBodyPeriodSettings,
  resolveBodyPeriodRange,
  saveBodyPeriodSettings,
  type BodyPeriodSettings,
} from '@/lib/member-body-period-settings'
import { RecordHistoryBadgeList } from '@/components/members/record-history-badge-list'
import { proteinIntakeBySlotFromRecord } from '@/lib/member-body-protein'
import { calculateMemberBmi, formatBodyMetric } from '@/lib/member-utils'
import {
  MemberBodyRecordFields,
  bodyRecordFormToNutritionInput,
  bodyRecordFormToWellnessInput,
  createEmptyBodyRecordFormValues,
  memberBodyRecordToFormValues,
  validateBasicBodyRecord,
  type MemberBodyRecordFormValues,
} from '@/components/members/member-body-record-fields'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { MemberBodyShareCopyButton } from '@/components/members/member-body-share-copy-button'

const CHART_LOADING = (
  <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/15 text-sm text-muted-foreground">
    그래프 불러오는 중…
  </div>
)

const MemberBodyWeightChart = dynamic(
  () =>
    import('@/components/members/member-body-weight-chart').then((mod) => ({
      default: mod.MemberBodyWeightChart,
    })),
  { ssr: false, loading: () => CHART_LOADING },
)

const MemberBodyMetricChart = dynamic(
  () =>
    import('@/components/members/member-body-metric-chart').then((mod) => ({
      default: mod.MemberBodyMetricChart,
    })),
  { ssr: false, loading: () => CHART_LOADING },
)

const BODY_CHART_TABS = [
  { id: 'weight', label: '체중' },
  { id: 'bmi', label: 'BMI' },
  { id: 'condition', label: '컨디션' },
  { id: 'sleep', label: '수면' },
  { id: 'pain', label: '통증' },
  { id: 'records', label: '기록' },
] as const

interface MemberBodyAnalysisViewProps {
  member: {
    id: string
    name: string
    sport: string | null
    height_cm: number | null
    weight_kg: number | null
    bmi: number | null
  }
  proteinSettings?: {
    protein_goal_multiplier: number
    protein_goal_mode: string
  }
  initialRecords: MemberBodyRecord[]
  tableReady: boolean
  wellnessColumnsReady?: boolean
  nutritionColumnsReady?: boolean
  backHref?: string
  canEditBodyBaseline?: boolean
  /** 외부 공유 페이지 — 그래프·요약만, 입력·수정 불가 */
  readOnly?: boolean
  /** 대시보드에서 공유 링크 패널 표시 */
  showShareLink?: boolean
  /** 성인회원 포털 — '선수' 대신 회원님 표기 */
  reportVariant?: 'athlete' | 'adult'
}

function formatRecordDate(date: string) {
  return format(parseISO(date), 'yyyy.M.d (EEE)', { locale: ko })
}

export function MemberBodyAnalysisView({
  member,
  initialRecords,
  tableReady,
  wellnessColumnsReady = true,
  nutritionColumnsReady = true,
  proteinSettings,
  backHref,
  canEditBodyBaseline = false,
  readOnly = false,
  showShareLink = true,
  reportVariant = 'athlete',
}: MemberBodyAnalysisViewProps) {
  const router = useRouter()
  const memberBackHref = backHref ?? `/dashboard/members/${member.id}`
  const [records, setRecords] = useState(initialRecords)
  const [formValues, setFormValues] = useState<MemberBodyRecordFormValues>(() => {
    const latest = initialRecords.at(-1)
    return createEmptyBodyRecordFormValues({
      date: format(new Date(), 'yyyy-MM-dd'),
      height: formatBodyMetric(latest?.height_cm ?? member.height_cm),
    })
  })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MemberBodyRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editingBootstrap, setEditingBootstrap] = useState(false)
  const [periodSettings, setPeriodSettings] = useState<BodyPeriodSettings>(
    DEFAULT_BODY_PERIOD_SETTINGS,
  )
  const [savedPeriodSettings, setSavedPeriodSettings] =
    useState<BodyPeriodSettings | null>(null)
  useEffect(() => {
    setRecords(initialRecords)
  }, [initialRecords])

  useEffect(() => {
    const existing = records.find(
      (record) =>
        record.recorded_at === formValues.date && !isBootstrapBodyRecord(record),
    )
    setFormValues((prev) => ({
      ...prev,
      proteinIntakeBySlot: existing
        ? proteinIntakeBySlotFromRecord(existing)
        : {},
    }))
  }, [formValues.date, records])

  useEffect(() => {
    const saved = loadBodyPeriodSettings(member.id)
    if (saved) {
      setPeriodSettings(saved)
      setSavedPeriodSettings(saved)
    }
  }, [member.id])

  const periodRange = useMemo(
    () => resolveBodyPeriodRange(periodSettings),
    [periodSettings],
  )

  const filteredRecords = useMemo(
    () => filterRecordsByPeriod(records, periodRange),
    [records, periodRange],
  )

  const chartGranularity = resolveBodyChartGranularity(periodSettings.mode)
  const chartRecords = useMemo(
    () => prepareRecordsForChart(filteredRecords, chartGranularity),
    [filteredRecords, chartGranularity],
  )
  const includeYearOnAxis = useMemo(() => chartSpanYears(chartRecords), [chartRecords])
  const isWeeklyChart = chartGranularity === 'weekly'

  const chartAxisDateLabel = useMemo(
    () => (date: string) =>
      buildChartAxisDateLabel(date, {
        includeYear: includeYearOnAxis,
        weekly: isWeeklyChart,
      }),
    [includeYearOnAxis, isWeeklyChart],
  )

  const stats = useMemo(
    () =>
      buildBodyAnalysisStats(
        filteredRecords,
        member.height_cm,
        periodSettings.mode === 'all' ? member.weight_kg : null,
      ),
    [filteredRecords, member.height_cm, member.weight_kg, periodSettings.mode],
  )

  const recentWeightChange = useMemo(
    () => buildRecentWeightChange(records),
    [records],
  )

  const chartPoints = useMemo(
    () =>
      chartRecords.map((record) => ({
        date: record.recorded_at,
        label: chartAxisDateLabel(record.recorded_at),
        weight: record.weight_kg,
      })),
    [chartRecords, chartAxisDateLabel],
  )

  const bmiChartPoints = useMemo(
    () =>
      chartRecords.flatMap((record) => {
        const height = resolveRecordHeight(member.height_cm, record.height_cm)
        const bmi = calculateMemberBmi(height, record.weight_kg)
        if (bmi == null) return []
        return [
          {
            date: record.recorded_at,
            label: chartAxisDateLabel(record.recorded_at),
            value: bmi,
          },
        ]
      }),
    [chartRecords, member.height_cm, chartAxisDateLabel],
  )

  const periodDirty = !bodyPeriodSettingsEqual(
    periodSettings,
    savedPeriodSettings ?? DEFAULT_BODY_PERIOD_SETTINGS,
  )
  const hasSavedPeriod = savedPeriodSettings != null
  const periodLabel = formatBodyPeriodLabel(periodSettings)

  const editingExistingRecord = useMemo(
    () =>
      records.find(
        (record) =>
          record.recorded_at === formValues.date && !isBootstrapBodyRecord(record),
      ) ?? null,
    [records, formValues.date],
  )

  function handleEditRecord(record: MemberBodyRecord) {
    setEditingBootstrap(isBootstrapBodyRecord(record))
    setFormValues(memberBodyRecordToFormValues(record))
    toast.info(`${formatRecordDate(record.recorded_at)} 기록을 불러왔습니다.`)
    requestAnimationFrame(() => {
      document
        .getElementById('today-record-top')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function handleSavePeriodSettings() {
    saveBodyPeriodSettings(member.id, periodSettings)
    setSavedPeriodSettings(periodSettings)
    toast.success('조회 기간 설정을 저장했습니다.')
  }

  function handleResetPeriodSettings() {
    setPeriodSettings(DEFAULT_BODY_PERIOD_SETTINGS)
    setSavedPeriodSettings(null)
    clearBodyPeriodSettings(member.id)
    toast.success('조회 기간 설정을 초기화했습니다.')
  }

  const displayBmi = stats.latestBmi ?? member.bmi
  const growthStatus = useMemo(() => getGrowthStatus(displayBmi), [displayBmi])
  const conditionStatus = useMemo(() => {
    const status = getLatestConditionStatus(filteredRecords)
    if (readOnly && status.tone === 'none') {
      return { label: '기록 없음', description: '컨디션 기록이 없습니다', tone: 'none' as const }
    }
    return status
  }, [filteredRecords, readOnly])
  const coachReport = useMemo(() => buildCoachCheckReport(records), [records])
  const chartTabs = useMemo(
    () => chartTabAvailability(filteredRecords),
    [filteredRecords],
  )

  const dateLabel = chartAxisDateLabel

  const conditionChartPoints = useMemo(
    () => buildConditionChartPoints(chartRecords, dateLabel),
    [chartRecords, dateLabel],
  )
  const sleepChartPoints = useMemo(
    () => buildSleepChartPoints(chartRecords, dateLabel),
    [chartRecords, dateLabel],
  )
  const painChartPoints = useMemo(
    () => buildPainChartPoints(chartRecords, dateLabel),
    [chartRecords, dateLabel],
  )
  const showChartTrendNotice = useMemo(
    () => shouldShowChartTrendNotice(records),
    [records],
  )

  function renderChartTrendNotice() {
    if (!showChartTrendNotice) return null
    return (
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        - {CHART_TREND_INITIAL_NOTICE}
      </p>
    )
  }

  async function handleAddWeight() {
    const validationError = validateBasicBodyRecord(formValues)
    if (validationError) {
      toast.error(validationError)
      return
    }

    if (editingBootstrap) {
      if (!canEditBodyBaseline) {
        toast.error('초기 설정은 관리자만 수정할 수 있습니다.')
        return
      }

      setSaving(true)
      const weightKg = Number(formValues.weight)
      const baselineResult = await updateMemberBodyBaseline(member.id, {
        recorded_at: formValues.date,
        height_cm: formValues.height,
        weight_kg: formValues.weight,
      })
      setSaving(false)

      if (baselineResult.error) {
        toast.error('초기 설정 저장 실패', { description: baselineResult.error })
        return
      }

      if (baselineResult.migrationHint) {
        toast.warning('DB 마이그레이션 필요', {
          description: baselineResult.migrationHint,
        })
      } else {
        toast.success('초기 설정을 저장했습니다.')
      }

      setRecords((prev) =>
        prev.map((row) =>
          isBootstrapBodyRecord(row)
            ? {
                ...row,
                recorded_at: formValues.date,
                weight_kg: weightKg,
                height_cm: Number(formValues.height),
              }
            : row,
        ),
      )
      setEditingBootstrap(false)
      router.refresh()
      return
    }

    setSaving(true)
    const weightKg = Number(formValues.weight)
    const result = await addMemberBodyRecord(member.id, weightKg, {
      recordedAt: formValues.date,
      heightCm: Number(formValues.height),
      wellness: bodyRecordFormToWellnessInput(formValues),
      nutrition: bodyRecordFormToNutritionInput(formValues, {
        weightKg,
        proteinSettings,
      }),
      proteinSettings,
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

    const migrationNotice = describeBodyRecordMigrationHint(result.migrationHint)
    if (migrationNotice) {
      toast.warning(migrationNotice.title, {
        description: migrationNotice.description,
      })
    } else {
      toast.success(
        editingExistingRecord ? '기록을 수정했습니다.' : '오늘 상태 기록이 저장되었습니다.',
      )
    }

    if (result.record) {
      setRecords((prev) => {
        const withoutSameDay = prev.filter(
          (row) =>
            row.id.startsWith('bootstrap-') ||
            row.recorded_at !== result.record!.recorded_at,
        )
        return [...withoutSameDay, result.record!].sort((a, b) => {
          const dateCmp = a.recorded_at.localeCompare(b.recorded_at)
          if (dateCmp !== 0) return dateCmp
          if (a.id.startsWith('bootstrap-')) return -1
          if (b.id.startsWith('bootstrap-')) return 1
          return a.created_at.localeCompare(b.created_at)
        })
      })
      setFormValues((prev) => ({
        ...prev,
        height:
          result.record!.height_cm != null
            ? formatBodyMetric(result.record!.height_cm)
            : prev.height,
        weight: formatBodyMetric(result.record!.weight_kg),
        sleepHours: result.record!.sleep_hours ?? '',
        condition: result.record!.condition ?? '',
        fatigue: result.record!.fatigue ?? '',
        muscleSoreness: result.record!.muscle_soreness ?? '',
        painArea: result.record!.pain_area ?? '',
        painLevel:
          result.record!.pain_level != null ? String(result.record!.pain_level) : '',
        painAreaNote: result.record!.pain_area_note ?? '',
        mealStatus: result.record!.meal_status ?? '',
        proteinIntakeBySlot: proteinIntakeBySlotFromRecord(result.record!),
        postWorkoutMealStatus: result.record!.post_workout_meal_status ?? '',
        hydrationStatus: result.record!.hydration_status ?? '',
        supplementStatus: result.record!.supplement_status ?? {},
      }))
    }
  }

  async function handleDeleteRecord() {
    if (!deleteTarget) return
    if (isBootstrapBodyRecord(deleteTarget)) {
      toast.error('삭제할 수 없음', {
        description: '신체정보 초기 설정은 삭제할 수 없습니다.',
      })
      setDeleteTarget(null)
      return
    }
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

  function renderChartEmpty(hasAnyRecords: boolean) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
        <Scale className="mb-3 h-10 w-10 text-primary/40" />
        <p>
          {hasAnyRecords
            ? '선택한 기간에 표시할 데이터가 없습니다.'
            : '아직 기록이 없습니다.'}
        </p>
        <p className="mt-1 text-xs">
          {hasAnyRecords
            ? '조회 기간을 바꾸거나 아래에서 기록을 추가해주세요.'
            : '수업현황에서 체중을 입력하거나 아래에서 직접 기록하세요.'}
        </p>
      </div>
    )
  }

  function renderComingSoon(label: string) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center text-muted-foreground">
        <Activity className="mb-3 h-10 w-10 text-primary/40" />
        <p className="font-medium text-foreground">{label} 기록 준비 중</p>
        <p className="mt-1 max-w-xs text-xs">
          곧 {label} 입력·그래프 연동이 추가됩니다.
        </p>
      </div>
    )
  }

  function renderRecordList(compact = false) {
    if (filteredRecords.length === 0) {
      return (
        <div
          className={cn(
            'flex items-center justify-center text-sm text-muted-foreground',
            compact ? 'h-[320px]' : 'py-8',
          )}
        >
          {records.length === 0
            ? '기록이 없습니다.'
            : '선택한 기간에 기록이 없습니다.'}
        </div>
      )
    }

    return (
      <div
        className={cn(
          'space-y-2',
          compact && 'max-h-[320px] overflow-y-auto pr-1',
        )}
      >
        {[...filteredRecords].reverse().map((record) => {
          const isBootstrap = isBootstrapBodyRecord(record)
          const height = resolveRecordHeight(member.height_cm, record.height_cm)
          return (
            <div
              key={record.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {formatRecordDate(record.recorded_at)}
                  {isBootstrap ? (
                    <span className="ml-2 text-xs font-normal text-primary">
                      초기 설정
                    </span>
                  ) : null}
                </p>
                <p className="text-xs tabular-nums text-foreground/90">
                  {height ? `${formatBodyMetric(height)}cm · ` : ''}
                  {formatBodyMetric(record.weight_kg)}kg
                  {height
                    ? ` · BMI ${calculateMemberBmi(height, record.weight_kg)?.toFixed(1) ?? '-'}`
                    : ''}
                </p>
                <RecordHistoryBadgeList record={record} />
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {!readOnly && (!isBootstrap || canEditBodyBaseline) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => handleEditRecord(record)}
                    aria-label={`${formatRecordDate(record.recorded_at)} 기록 수정`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
                {!readOnly && !isBootstrap ? (
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
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div id="report-top" className="scroll-mt-28 space-y-6">
      {readOnly ? (
        <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-center text-[11px] text-muted-foreground">
          읽기 전용 리포트 · 그래프와 요약만 표시됩니다
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {!readOnly ? (
            <Link href={memberBackHref}>
              <Button variant="ghost" size="icon" className="mt-1">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          ) : null}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Athlete Condition Report
            </p>
            <h1 className="text-2xl font-bold lg:text-3xl">
              {reportVariant === 'adult' ? (
                <>
                  <span className="mr-1">{member.name}</span>
                  회원님의 컨디션 &amp; 신체변화
                </>
              ) : (
                <>
                  <span className="mr-2">{member.name}</span>
                  선수의 컨디션 &amp; 신체변화
                </>
              )}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground/90">
              체중은 경기력과 컨디션을 확인하기 위한 참고 지표입니다.
              <br />
              무리한 감량보다 성장, 회복, 훈련 지속성이 더 중요합니다.
            </p>
          </div>
        </div>
        {!readOnly && !tableReady ? (
          <p className="text-xs text-amber-400">
            DB: supabase/add-member-body-records.sql 실행 필요
          </p>
        ) : !readOnly && !nutritionColumnsReady ? (
          <p className="max-w-xs text-xs leading-relaxed text-amber-300/90">
            Supabase SQL Editor에서 add-member-body-nutrition-fields.sql,
            add-member-protein-tracking.sql 실행 필요
          </p>
        ) : !readOnly && !wellnessColumnsReady ? (
          <p className="max-w-xs text-xs leading-relaxed text-amber-300/90">
            컨디션 저장: supabase/add-member-body-wellness-fields.sql 실행 필요
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-1.5 pt-5">
            <p className="text-xs font-medium text-foreground">현재 체중</p>
            <p className="text-2xl font-bold tabular-nums">
              {stats.latest != null ? `${formatBodyMetric(stats.latest)}kg` : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1.5 pt-5">
            <p className="text-xs font-medium text-foreground">최근 체중 변화</p>
            <p
              className={cn(
                'text-2xl font-bold tabular-nums',
                recentWeightChange.delta == null
                  ? ''
                  : recentWeightChange.delta > 0
                    ? 'text-amber-300'
                    : recentWeightChange.delta < 0
                      ? 'text-sky-300'
                      : '',
              )}
            >
              {recentWeightChange.delta == null
                ? '-'
                : `${recentWeightChange.delta > 0 ? '+' : ''}${formatBodyMetric(recentWeightChange.delta)}kg`}
            </p>
            <p className="text-[11px] text-foreground/70">
              {recentWeightChange.description}
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardContent className="space-y-1.5 pt-5">
            <p className="text-xs font-medium text-foreground">BMI / 성장 상태</p>
            <p
              className={cn(
                'text-2xl font-bold',
                wellnessSummaryToneClass(growthStatus.tone),
              )}
            >
              {growthStatus.label}
            </p>
            <p className="text-[11px] text-foreground/70">{growthStatus.description}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardContent className="space-y-1.5 pt-5">
            <p className="text-xs font-medium text-foreground">컨디션</p>
            <p
              className={cn(
                'text-2xl font-bold',
                conditionStatusToneClass(conditionStatus.tone),
              )}
            >
              {conditionStatus.label}
            </p>
            <p className="text-[11px] text-foreground/70">{conditionStatus.description}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
      <Card className="gap-0 border-primary/20 py-0">
        <CardHeader className="relative flex min-h-11 !grid-rows-none items-center justify-center border-b border-primary/20 bg-primary/5 px-4 !py-0 !pb-0 sm:px-6">
          <CardTitle className="flex items-center justify-center gap-2 text-base font-semibold text-foreground">
            <Activity className="h-4 w-4 shrink-0 text-primary" />
            컨디션 &amp; 체중 변화 그래프
          </CardTitle>
          {!readOnly && showShareLink ? (
            <MemberBodyShareCopyButton
              memberId={member.id}
              className="absolute right-3 top-1/2 -translate-y-1/2 sm:right-4"
            />
          ) : null}
        </CardHeader>
        <Tabs defaultValue="weight" className="gap-0">
          <div className="border-b border-primary/20 bg-primary/5 px-4 sm:px-6">
            <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
              {BODY_CHART_TABS.map((tab) => {
                const enabled = chartTabs[tab.id]
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    disabled={!enabled}
                    className="min-h-11 shrink-0 rounded-md px-3 text-xs font-medium text-foreground/80 disabled:opacity-40 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
                  >
                    {tab.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>
          <CardContent className="px-4 pb-4 pt-4 sm:px-6">
            <TabsContent value="weight" className="mt-0">
              {chartPoints.length > 0 ? (
                <>
                  <MemberBodyWeightChart points={chartPoints} className="h-[320px] w-full" />
                  {renderChartTrendNotice()}
                </>
              ) : (
                renderChartEmpty(records.length > 0)
              )}
            </TabsContent>
            <TabsContent value="bmi" className="mt-0">
              {bmiChartPoints.length > 0 ? (
                <>
                  <MemberBodyMetricChart
                    points={bmiChartPoints}
                    metricKey="bmi"
                    metricLabel="BMI"
                    formatValue={(value) => value.toFixed(1)}
                    className="h-[320px] w-full"
                  />
                  {renderChartTrendNotice()}
                </>
              ) : (
                renderChartEmpty(records.length > 0)
              )}
            </TabsContent>
            <TabsContent value="condition" className="mt-0">
              {conditionChartPoints.length > 0 ? (
                <>
                  <MemberBodyMetricChart
                    points={conditionChartPoints}
                    metricKey="condition"
                    metricLabel="컨디션"
                    formatValue={(value) =>
                      value >= 2.5 ? '좋음' : value >= 1.5 ? '보통' : '주의 필요'
                    }
                    className="h-[320px] w-full"
                  />
                  {renderChartTrendNotice()}
                </>
              ) : (
                renderComingSoon('컨디션')
              )}
            </TabsContent>
            <TabsContent value="sleep" className="mt-0">
              {sleepChartPoints.length > 0 ? (
                <>
                  <MemberBodyMetricChart
                    points={sleepChartPoints}
                    metricKey="sleep"
                    metricLabel="수면"
                    formatValue={(value) => `${value}단계`}
                    className="h-[320px] w-full"
                  />
                  {renderChartTrendNotice()}
                </>
              ) : (
                renderComingSoon('수면')
              )}
            </TabsContent>
            <TabsContent value="pain" className="mt-0">
              {painChartPoints.length > 0 ? (
                <>
                  <MemberBodyMetricChart
                    points={painChartPoints}
                    metricKey="pain"
                    metricLabel="통증·근육통"
                    formatValue={(value) =>
                      value >= 2.5 ? '양호' : value >= 1.5 ? '약간' : '주의'
                    }
                    className="h-[320px] w-full"
                  />
                  {renderChartTrendNotice()}
                </>
              ) : (
                renderComingSoon('통증')
              )}
            </TabsContent>
            <TabsContent value="records" className="mt-0">
              {renderRecordList(true)}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      <div className="rounded-lg border border-border/70 bg-muted/10 px-2.5 py-1.5 sm:px-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5 text-primary" />
            조회 기간
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {BODY_PERIOD_PRESETS.map((preset) => (
              <Button
                key={preset.mode}
                type="button"
                size="sm"
                variant={periodSettings.mode === preset.mode ? 'default' : 'outline'}
                className="h-7 px-2 text-[11px]"
                onClick={() =>
                  setPeriodSettings((prev) => {
                    if (isBodyGranularityMode(preset.mode)) {
                      const range = defaultBodyGranularityRange()
                      return {
                        mode: preset.mode,
                        fromDate: range.from,
                        toDate: range.to,
                      }
                    }
                    if (preset.mode === 'custom') {
                      return { ...prev, mode: 'custom' }
                    }
                    return { mode: preset.mode }
                  })
                }
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            현재: <span className="text-foreground">{periodLabel}</span>
            {!readOnly && hasSavedPeriod && !periodDirty ? (
              <span className="ml-1 text-primary">· 저장됨</span>
            ) : !readOnly && periodDirty ? (
              <span className="ml-1 text-amber-400">· 미저장</span>
            ) : null}
          </span>
          {!readOnly ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={!periodDirty}
              onClick={handleSavePeriodSettings}
            >
              <Save className="mr-1 h-3 w-3" />
              저장
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              disabled={
                periodSettings.mode === 'all' && !hasSavedPeriod && !periodDirty
              }
              onClick={handleResetPeriodSettings}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              초기화
            </Button>
          </div>
          ) : null}
        </div>
        {periodSettings.mode === 'custom' || isBodyGranularityMode(periodSettings.mode) ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-border/50 pt-1.5">
            <KoreanDatePicker
              id="body-period-from"
              value={
                periodSettings.fromDate ??
                (isBodyGranularityMode(periodSettings.mode)
                  ? defaultBodyGranularityRange().from
                  : '')
              }
              onChange={(value) =>
                setPeriodSettings((prev) => ({ ...prev, fromDate: value || undefined }))
              }
              placeholder="시작일"
              compact
              className="h-8 w-[148px] text-xs"
            />
            <span className="text-[11px] text-muted-foreground">~</span>
            <KoreanDatePicker
              id="body-period-to"
              value={
                periodSettings.toDate ??
                (isBodyGranularityMode(periodSettings.mode)
                  ? defaultBodyGranularityRange().to
                  : '')
              }
              onChange={(value) =>
                setPeriodSettings((prev) => ({ ...prev, toDate: value || undefined }))
              }
              placeholder="종료일"
              compact
              className="h-8 w-[148px] text-xs"
            />
            {isBodyGranularityMode(periodSettings.mode) ? (
              <span className="text-[11px] text-muted-foreground">
                기본 {BODY_CHART_GRANULARITY_WEEKS}주 · 기간을 늘리면 점이 더 표시됩니다
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {!readOnly ? (
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          id="coach-check"
          className="order-2 scroll-mt-28 border-primary/15 bg-primary/5 lg:order-1"
        >
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              코치 체크
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'rounded-lg border px-3 py-3',
                coachCheckStatusClasses(coachReport.overallStatus),
              )}
            >
              <p className="text-xs font-semibold">오늘 훈련 판단</p>
              <p className="mt-1 text-sm font-bold">
                {COACH_CHECK_STATUS_LABELS[coachReport.overallStatus]}
              </p>

              {coachReport.warningSignals.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold">주의 신호</p>
                  <ul className="mt-1.5 space-y-0.5 text-sm leading-relaxed">
                    {coachReport.warningSignals.map((signal) => (
                      <li key={signal}>- {signal}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {coachReport.recoveryPoints.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold">회복 보완</p>
                  <ul className="mt-1.5 space-y-0.5 text-sm leading-relaxed">
                    {coachReport.recoveryPoints.map((point) => (
                      <li key={point}>- {point}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {coachReport.positiveFlows.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-emerald-300">긍정 흐름</p>
                  <ul className="mt-1.5 space-y-0.5 text-sm leading-relaxed text-emerald-200/90">
                    {coachReport.positiveFlows.map((flow) => (
                      <li key={flow}>- {flow}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {coachReport.recordCheckNotes.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted-foreground">기록 확인</p>
                  <ul className="mt-1.5 space-y-0.5 text-sm leading-relaxed text-muted-foreground">
                    {coachReport.recordCheckNotes.map((note) => (
                      <li key={note}>- {note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-3">
                <p className="text-xs font-semibold">추천</p>
                <p className="mt-1 text-sm leading-relaxed">{coachReport.recommendation}</p>
              </div>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
              {coachReport.historyNote}
            </p>
          </CardContent>
        </Card>

        <Card className="order-3 lg:order-2">
          <CardHeader className="py-3">
            <CardTitle className="text-base">기록 이력</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">{renderRecordList()}</CardContent>
        </Card>

        <Card id="today-record" className="order-1 lg:order-3">
          <CardHeader id="today-record-top" className="scroll-mt-[4.5rem]">
            <CardTitle className="text-base">
              {editingBootstrap
                ? '초기 설정 수정'
                : editingExistingRecord
                  ? `${formatRecordDate(formValues.date)} 기록 수정`
                  : '오늘 상태 기록'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editingBootstrap && canEditBodyBaseline ? (
              <p className="text-xs leading-relaxed text-primary/90">
                초기 설정 날짜·키·몸무게를 변경할 수 있습니다. (관리자 전용)
              </p>
            ) : null}
            <MemberBodyRecordFields
              idPrefix="body-record"
              values={formValues}
              onChange={setFormValues}
              proteinSettings={proteinSettings}
              disabled={saving}
              onEnterSubmit={() => void handleAddWeight()}
            />
            <Button
              type="button"
              className="min-h-11 w-full"
              disabled={saving}
              onClick={() => void handleAddWeight()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중
                </>
              ) : editingBootstrap ? (
                '초기 설정 저장'
              ) : editingExistingRecord ? (
                '수정 저장'
              ) : (
                '기록하기'
              )}
            </Button>
            <p className="text-xs text-foreground/70">
              키·몸무게만 입력해도 저장됩니다. 컨디션·회복·영양은 버튼으로 빠르게 기록하세요.
            </p>
          </CardContent>
        </Card>
      </div>
      ) : null}

      </div>

      {!readOnly ? (
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
                ? `${formatRecordDate(deleteTarget.recorded_at)} · ${formatBodyMetric(deleteTarget.weight_kg)}kg 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
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
      ) : null}
    </div>
  )
}
