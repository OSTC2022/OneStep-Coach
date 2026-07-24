'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  Activity,
  ChartLine,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Trophy,
  Utensils,
} from 'lucide-react'
import { toast } from 'sonner'
import { addMemberBodyRecord } from '@/lib/actions/member-body-records'
import type { AdultGeneralPortalData } from '@/lib/actions/adult-general-portal'
import {
  formatWeightDeltaInParens,
  weightDeltaTextClass,
} from '@/lib/member-weight-delta'
import {
  formatBodyMetric,
  roundBodyMetric,
} from '@/lib/member-utils'
import { formatPackageExpiryDateLabel } from '@/lib/session-package-utils'
import { MemberBodyWeightChart } from '@/components/members/member-body-weight-chart'
import {
  MemberBodyRecordFields,
  bodyRecordFormToNutritionInput,
  bodyRecordFormToWellnessInput,
  createEmptyBodyRecordFormValues,
  memberBodyRecordToFormValues,
  validateBasicBodyRecord,
  type MemberBodyRecordFormValues,
} from '@/components/members/member-body-record-fields'
import { MemberCenterContactCard } from '@/components/members/member-center-contact-card'
import { AdultGeneralAttendanceRankingDialog } from '@/components/dashboard/adult-general-attendance-ranking-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return '-'
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

const RECORD_LIST_PAGE_SIZE = 4

function getRecordListPageWindow(
  current: number,
  total: number,
  windowSize = 4,
): number[] {
  if (total <= 0) return []
  if (total <= windowSize) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }
  let start = Math.max(1, current - Math.floor((windowSize - 1) / 2))
  let end = start + windowSize - 1
  if (end > total) {
    end = total
    start = Math.max(1, end - windowSize + 1)
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function SectionCard({
  id,
  icon: Icon,
  title,
  hint,
  children,
  accent = false,
}: {
  id?: string
  icon: typeof Activity
  title: string
  hint?: string
  children: React.ReactNode
  accent?: boolean
}) {
  return (
    <Card
      id={id}
      className={cn(
        'overflow-hidden border-border/80',
        accent && 'border-primary/30 bg-primary/[0.03]',
      )}
    >
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              accent ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function MetricTile({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string
  value: string
  hint?: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', valueClassName)}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function MemberAdultGeneralPortal({
  data,
  adminPreview = false,
}: {
  data: AdultGeneralPortalData
  adminPreview?: boolean
}) {
  const { portal, bodyRecords, proteinSettings, attendanceRanking, attendancePeriodLabel } =
    data
  const { member, sessionStatus, centerContact, coachContact } = portal
  const today = format(new Date(), 'yyyy-MM-dd')

  const [records, setRecords] = useState(bodyRecords)
  const [form, setForm] = useState<MemberBodyRecordFormValues>(() =>
    createEmptyBodyRecordFormValues({
      date: today,
      height:
        member.height_cm != null ? formatBodyMetric(member.height_cm) : '',
      weight: '',
    }),
  )
  const [saving, setSaving] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [rankingOpen, setRankingOpen] = useState(false)
  const [recordListPage, setRecordListPage] = useState(1)

  const recordListTotalPages = Math.max(
    1,
    Math.ceil(records.length / RECORD_LIST_PAGE_SIZE),
  )
  const safeRecordListPage = Math.min(recordListPage, recordListTotalPages)
  const pagedRecords = useMemo(() => {
    const start = (safeRecordListPage - 1) * RECORD_LIST_PAGE_SIZE
    return records.slice(start, start + RECORD_LIST_PAGE_SIZE)
  }, [records, safeRecordListPage])
  const recordListPageNumbers = useMemo(
    () => getRecordListPageWindow(safeRecordListPage, recordListTotalPages),
    [safeRecordListPage, recordListTotalPages],
  )

  useEffect(() => {
    setRecordListPage((page) => Math.min(page, recordListTotalPages))
  }, [recordListTotalPages])

  useEffect(() => {
    if (!editingRecordId) return
    const index = records.findIndex((row) => row.id === editingRecordId)
    if (index < 0) return
    setRecordListPage(Math.floor(index / RECORD_LIST_PAGE_SIZE) + 1)
  }, [editingRecordId, records])

  const latest = records[0] ?? null
  const previous = records[1] ?? null
  const startWeight = records.length > 0 ? records[records.length - 1] : null

  const weightDeltaFromPrevious =
    latest && previous
      ? roundBodyMetric((latest.weight_kg ?? 0) - (previous.weight_kg ?? 0))
      : null
  const weightDeltaFromStart =
    latest && startWeight && startWeight.id !== latest.id
      ? roundBodyMetric((latest.weight_kg ?? 0) - (startWeight.weight_kg ?? 0))
      : null

  const chartPoints = useMemo(
    () =>
      [...records]
        .slice()
        .reverse()
        .filter((r) => r.weight_kg != null && r.weight_kg > 0)
        .map((r) => ({
          date: r.recorded_at.slice(0, 10),
          label: chartAxisLabel(r.recorded_at),
          weight: r.weight_kg as number,
        })),
    [records],
  )

  const remainingLabel =
    sessionStatus.kind === 'monthly'
      ? sessionStatus.remainingPeriodLabel
      : sessionStatus.isUsable
        ? `잔여 ${sessionStatus.remainingSessions}회`
        : '이용권 확인 필요'

  const remainingHint =
    sessionStatus.kind === 'monthly'
      ? sessionStatus.expiresAt
        ? `만료 ${formatPackageExpiryDateLabel(sessionStatus.expiresAt)} · ${sessionStatus.planLabel}`
        : sessionStatus.planLabel
      : sessionStatus.isUsable
        ? '횟수권 기준'
        : '센터에 문의해 주세요'

  function handleLoadRecord(record: (typeof records)[number]) {
    if (adminPreview) return
    const loaded = memberBodyRecordToFormValues(record)
    setForm({
      ...loaded,
      date: record.recorded_at.slice(0, 10),
    })
    setEditingRecordId(record.id)
    toast.message('기록을 불러왔습니다.', {
      description: '점심·저녁 등 추가 입력 후 다시 저장하세요.',
    })
    document.getElementById('nutrition-record')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function handleClearEdit() {
    setEditingRecordId(null)
    setForm(
      createEmptyBodyRecordFormValues({
        date: today,
        height:
          member.height_cm != null ? formatBodyMetric(member.height_cm) : '',
        weight: '',
      }),
    )
  }

  async function handleSaveRecord() {
    const error = validateBasicBodyRecord(form)
    if (error) {
      toast.error(error)
      return
    }

    setSaving(true)
    const height = Number(form.height)
    const weight = Number(form.weight)
    const result = await addMemberBodyRecord(member.id, weight, {
      recordedAt: form.date,
      heightCm: height,
      wellness: bodyRecordFormToWellnessInput(form),
      nutrition: bodyRecordFormToNutritionInput(form, {
        weightKg: weight,
        proteinSettings,
      }),
      proteinSettings,
    })
    setSaving(false)

    if (result.error) {
      toast.error('기록 저장 실패', {
        description: result.migrationHint
          ? `${result.error} · ${result.migrationHint}`
          : result.error,
      })
      return
    }

    if (result.record) {
      setRecords((prev) => {
        const withoutSameDay = prev.filter(
          (row) =>
            row.recorded_at.slice(0, 10) !==
            result.record!.recorded_at.slice(0, 10),
        )
        return [result.record!, ...withoutSameDay].sort((a, b) =>
          b.recorded_at.localeCompare(a.recorded_at),
        )
      })
      const deltaLabel = formatWeightDeltaInParens(result.weightDeltaKg ?? null)
      toast.success(
        editingRecordId
          ? '기록이 수정되었습니다.'
          : deltaLabel ? (
              <span className="font-semibold tabular-nums">
                {formatBodyMetric(weight)}kg
                <span
                  className={cn(
                    'ml-1',
                    weightDeltaTextClass(result.weightDeltaKg ?? null),
                  )}
                >
                  {deltaLabel}
                </span>
              </span>
            ) : (
              `${formatBodyMetric(weight)}kg 기록 완료`
            ),
      )
      // 수정 모드면 저장 후에도 폼 유지 → 이어서 추가 입력 가능
      if (editingRecordId) {
        setForm(memberBodyRecordToFormValues({
          ...result.record,
          recorded_at: result.record.recorded_at.slice(0, 10),
        }))
        setEditingRecordId(result.record.id)
      } else {
        setForm(
          createEmptyBodyRecordFormValues({
            date: today,
            height: formatBodyMetric(height),
            weight: '',
          }),
        )
        setEditingRecordId(null)
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-[960px] space-y-5 sm:space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-background to-background px-5 py-5 sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              OneStep · 관리 프로그램
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
              {member.name}님, 오늘도 한 걸음
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              전문 센터 케어 루틴으로 체중·영양·출석을 한곳에서 관리합니다.
              {adminPreview ? ' (관리자 미리보기)' : null}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0 rounded-2xl border-primary/40 bg-primary/15 text-primary shadow-sm hover:bg-primary/25 hover:text-primary"
            aria-label="출석률 랭킹전 열기"
            onClick={() => setRankingOpen(true)}
          >
            <Trophy className="h-5 w-5" />
          </Button>
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border/60 pt-3 text-sm">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <dt className="shrink-0 text-xs text-muted-foreground">프로그램</dt>
            <dd className="font-medium">평일 오전반</dd>
          </div>
          <div className="flex min-w-0 items-baseline gap-1.5">
            <dt className="shrink-0 text-xs text-muted-foreground">코치</dt>
            <dd className="truncate font-medium">
              {member.primary_instructor?.name ?? '자율배정'}
            </dd>
          </div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
            <dt className="shrink-0 text-xs text-muted-foreground">회원권</dt>
            <dd
              className={cn(
                'font-medium',
                sessionStatus.isUsable ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {remainingLabel}
              {remainingHint ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  ({remainingHint})
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </header>

      <AdultGeneralAttendanceRankingDialog
        open={rankingOpen}
        onOpenChange={setRankingOpen}
        entries={attendanceRanking}
        periodLabel={attendancePeriodLabel}
      />

      {/* 체중 그래프 + 변화 */}
      <SectionCard
        id="weight-chart"
        icon={ChartLine}
        title="체중 그래프"
        hint="추이 · 직전 대비 · 시작 대비"
        accent
      >
        <div className="space-y-4">
          {chartPoints.length >= 2 ? (
            <MemberBodyWeightChart points={chartPoints} />
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
              기록이 2회 이상이면 그래프가 표시됩니다
            </div>
          )}

          {latest ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <MetricTile
                label="최근 체중"
                value={`${formatBodyMetric(latest.weight_kg)}kg`}
                hint={formatDateLabel(latest.recorded_at)}
                valueClassName="text-primary"
              />
              <MetricTile
                label="직전 대비"
                value={
                  weightDeltaFromPrevious != null
                    ? formatWeightDeltaInParens(weightDeltaFromPrevious) ||
                      '변화 없음'
                    : '-'
                }
                valueClassName={weightDeltaTextClass(weightDeltaFromPrevious)}
              />
              <MetricTile
                label="시작 대비"
                value={
                  weightDeltaFromStart != null
                    ? formatWeightDeltaInParens(weightDeltaFromStart) ||
                      '변화 없음'
                    : '-'
                }
                valueClassName={weightDeltaTextClass(weightDeltaFromStart)}
                hint={
                  startWeight
                    ? `시작 ${formatBodyMetric(startWeight.weight_kg)}kg`
                    : undefined
                }
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              아직 체중 기록이 없습니다. 아래에서 오늘 기록을 남겨 주세요.
            </p>
          )}
        </div>
      </SectionCard>

      {/* 영양관리 및 입력 */}
      <SectionCard
        id="nutrition-record"
        icon={Utensils}
        title="영양관리 및 입력"
        hint="체중·키와 함께 식사·수분·보충제를 기록합니다"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(12rem,0.85fr)_minmax(0,1.2fr)]">
          <div className="min-w-0 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">수정 목록</p>
              {records.length > 0 ? (
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {records.length}건 · {safeRecordListPage}/{recordListTotalPages}페이지
                </p>
              ) : null}
            </div>
            {records.length > 0 ? (
              <div className="space-y-2">
                <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
                  {pagedRecords.map((record) => {
                  const isToday =
                    record.recorded_at.slice(0, 10) === today
                  const isEditing = editingRecordId === record.id
                  return (
                    <li
                      key={record.id}
                      className={cn(
                        'px-3 py-2.5 text-sm',
                        isEditing && 'bg-primary/15 ring-1 ring-inset ring-primary/30',
                        !isEditing && isToday && 'bg-primary/10',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {formatDateLabel(record.recorded_at)}
                          {isToday ? (
                            <span className="ml-1 text-[10px] font-medium text-primary">
                              오늘
                            </span>
                          ) : null}
                        </span>
                        <span className="font-semibold tabular-nums text-primary">
                          {formatBodyMetric(record.weight_kg)}kg
                        </span>
                      </div>
                      {(record.height_cm != null ||
                        record.meal_status ||
                        record.hydration_status ||
                        record.protein_status) && (
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {[
                            record.height_cm != null
                              ? `키 ${formatBodyMetric(record.height_cm)}cm`
                              : null,
                            record.meal_status
                              ? `식사 ${
                                  record.meal_status === 'good'
                                    ? '잘 먹음'
                                    : record.meal_status === 'poor'
                                      ? '부족'
                                      : '보통'
                                }`
                              : null,
                            record.hydration_status
                              ? `수분 ${
                                  record.hydration_status === 'good'
                                    ? '충분'
                                    : record.hydration_status === 'poor'
                                      ? '부족'
                                      : '보통'
                                }`
                              : null,
                            record.protein_status
                              ? `단백질 ${
                                  record.protein_status === 'sufficient'
                                    ? '충분'
                                    : record.protein_status === 'insufficient'
                                      ? '부족'
                                      : '보통'
                                }`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      {!adminPreview ? (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant={isEditing ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 w-full text-xs"
                            disabled={saving}
                            onClick={() => handleLoadRecord(record)}
                          >
                            {isEditing ? '수정 중' : '수정 · 불러오기'}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
                </ul>

                {recordListTotalPages > 1 ? (
                  <nav
                    className="flex flex-wrap items-center justify-center gap-0.5"
                    aria-label="수정 목록 페이지"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={safeRecordListPage <= 1}
                      aria-label="처음 페이지"
                      title="처음 페이지"
                      onClick={() => setRecordListPage(1)}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={safeRecordListPage <= 1}
                      aria-label="이전 페이지"
                      title="이전 페이지"
                      onClick={() =>
                        setRecordListPage((page) => Math.max(1, page - 1))
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {recordListPageNumbers.map((pageNumber) => (
                      <Button
                        key={pageNumber}
                        type="button"
                        variant={
                          pageNumber === safeRecordListPage ? 'default' : 'ghost'
                        }
                        size="icon"
                        className="h-8 w-8 tabular-nums"
                        aria-label={`${pageNumber}페이지`}
                        aria-current={
                          pageNumber === safeRecordListPage ? 'page' : undefined
                        }
                        onClick={() => setRecordListPage(pageNumber)}
                      >
                        {pageNumber}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={safeRecordListPage >= recordListTotalPages}
                      aria-label="다음 페이지"
                      title="다음 페이지"
                      onClick={() =>
                        setRecordListPage((page) =>
                          Math.min(recordListTotalPages, page + 1),
                        )
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={safeRecordListPage >= recordListTotalPages}
                      aria-label="마지막 페이지"
                      title="마지막 페이지"
                      onClick={() => setRecordListPage(recordListTotalPages)}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </nav>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-border/70 px-3 text-center text-xs text-muted-foreground">
                저장하면 왼쪽에 기록이 쌓입니다
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            {editingRecordId ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
                <span className="font-medium text-primary">
                  불러온 기록 수정 중 · 점심·저녁을 이어서 입력하세요
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  disabled={saving}
                  onClick={handleClearEdit}
                >
                  새로 작성
                </Button>
              </div>
            ) : null}
            <MemberBodyRecordFields
              idPrefix="adult-general"
              values={form}
              onChange={setForm}
              proteinSettings={proteinSettings}
              layoutVariant="adult_general"
              disabled={saving || adminPreview}
              defaultNutritionOpen={false}
              onEnterSubmit={() => {
                if (!adminPreview) void handleSaveRecord()
              }}
            />
            {!adminPreview ? (
              <Button
                type="button"
                className="min-h-11 w-full"
                disabled={saving}
                onClick={() => void handleSaveRecord()}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중…
                  </>
                ) : editingRecordId ? (
                  '수정 내용 저장'
                ) : (
                  '오늘 기록 저장'
                )}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                관리자 미리보기에서는 저장되지 않습니다.
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Activity} title="센터 연락">
        <MemberCenterContactCard
          coach={coachContact}
          center={centerContact}
        />
      </SectionCard>
    </div>
  )
}
