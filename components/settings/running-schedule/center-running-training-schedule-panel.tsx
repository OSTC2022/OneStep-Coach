'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  BookmarkPlus,
  ChevronDown,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  MapPin,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getCenterRunningTrainingScheduleForAdmin,
  saveCenterRunningTrainingSchedule,
} from '@/lib/actions/center-running-training-schedule'
import {
  deleteCenterTrainingScheduleLocationPreset,
  fetchCenterTrainingScheduleLibrary,
  saveCenterTrainingScheduleLocationPreset,
  type CenterTrainingScheduleLibrary,
  type CenterTrainingScheduleLocationPreset,
  type CenterTrainingScheduleWeekSnapshot,
} from '@/lib/actions/center-running-training-schedule-library'
import {
  TRAINING_WEEKDAY_LABELS,
  createEmptyTrainingScheduleDays,
  formatTrainingScheduleDateLabel,
  propagateTrainingWeekDatesFromMonday,
  type RunningLeagueTrainingScheduleDayInput,
} from '@/lib/running-league/training-schedule'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function formatSavedAtLabel(savedAt: string): string {
  try {
    return format(new Date(savedAt), 'M/d HH:mm', { locale: ko })
  } catch {
    return savedAt
  }
}

function mergeLoadedDays(
  loaded: RunningLeagueTrainingScheduleDayInput[],
): RunningLeagueTrainingScheduleDayInput[] {
  const byWeekday = new Map(loaded.map((day) => [day.weekday, day]))
  return createEmptyTrainingScheduleDays().map((empty) => {
    const found = byWeekday.get(empty.weekday)
    return found ? { ...empty, ...found } : empty
  })
}

function SavedScheduleLibrary({
  library,
  pending,
  onLoadWeek,
  onApplyLocation,
  onDeleteLocation,
}: {
  library: CenterTrainingScheduleLibrary
  pending: boolean
  onLoadWeek: (snapshot: CenterTrainingScheduleWeekSnapshot) => void
  onApplyLocation: (weekday: number, preset: CenterTrainingScheduleLocationPreset) => void
  onDeleteLocation: (presetId: string) => void
}) {
  const [locationsOpen, setLocationsOpen] = useState(false)
  const hasSnapshots = library.weekSnapshots.length > 0
  const hasLocations = library.locationPresets.length > 0

  if (!hasSnapshots && !hasLocations) return null

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-3">
      <p className="text-xs font-semibold text-foreground">저장 목록</p>

      {hasSnapshots ? (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">주간 스케줄</p>
          <ul className="space-y-1.5">
            {library.weekSnapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{snapshot.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    저장 {formatSavedAtLabel(snapshot.saved_at)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={pending}
                  onClick={() => onLoadWeek(snapshot)}
                >
                  <FolderOpen className="mr-1 h-3.5 w-3.5" />
                  불러오기
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasLocations ? (
        <div className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setLocationsOpen((value) => !value)}
            aria-expanded={locationsOpen}
          >
            <p className="text-[11px] font-medium text-muted-foreground">
              저장된 장소 ({library.locationPresets.length})
            </p>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                locationsOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
          {locationsOpen ? (
            <ul className="space-y-1.5">
              {library.locationPresets.map((preset) => (
              <li
                key={preset.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{preset.location_label}</p>
                  {preset.naver_map_url ? (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {preset.naver_map_url}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">지도 URL 없음</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-8">
                        적용
                        <ChevronDown className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuLabel className="text-xs">요일 선택</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {TRAINING_WEEKDAY_LABELS.map((label, weekday) => (
                        <DropdownMenuItem
                          key={weekday}
                          onClick={() => onApplyLocation(weekday, preset)}
                        >
                          {label}요일
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    disabled={pending}
                    onClick={() => onDeleteLocation(preset.id)}
                    aria-label="장소 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function CenterRunningTrainingSchedulePanel() {
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [tableReady, setTableReady] = useState(true)
  const [library, setLibrary] = useState<CenterTrainingScheduleLibrary>({
    tableReady: false,
    weekSnapshots: [],
    locationPresets: [],
  })
  const [days, setDays] = useState<RunningLeagueTrainingScheduleDayInput[]>(
    createEmptyTrainingScheduleDays(),
  )

  const refreshLibrary = useCallback(() => {
    startTransition(async () => {
      const result = await fetchCenterTrainingScheduleLibrary()
      setLibrary(result)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    startTransition(async () => {
      const [scheduleResult, libraryResult] = await Promise.all([
        getCenterRunningTrainingScheduleForAdmin(),
        fetchCenterTrainingScheduleLibrary(),
      ])
      if (cancelled) return
      setTableReady(scheduleResult.tableReady)
      setLibrary(libraryResult)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function updateDay(
    weekday: number,
    patch: Partial<RunningLeagueTrainingScheduleDayInput>,
  ) {
    setDays((current) =>
      current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)),
    )
  }

  function updateMondayScheduleDate(mondayDate: string) {
    setDays((current) => propagateTrainingWeekDatesFromMonday(current, mondayDate))
  }

  function resetDraftForm() {
    setDays(createEmptyTrainingScheduleDays())
  }

  function loadWeekSnapshot(snapshot: CenterTrainingScheduleWeekSnapshot) {
    setDays(mergeLoadedDays(snapshot.days))
    toast.success(`${snapshot.label} 스케줄을 불러왔습니다.`)
  }

  function applyLocationPreset(
    weekday: number,
    preset: CenterTrainingScheduleLocationPreset,
  ) {
    updateDay(weekday, {
      location_label: preset.location_label,
      naver_map_url: preset.naver_map_url,
    })
    toast.success(`${TRAINING_WEEKDAY_LABELS[weekday]}요일에 장소를 적용했습니다.`)
  }

  function saveLocationPreset(day: RunningLeagueTrainingScheduleDayInput) {
    startTransition(async () => {
      const result = await saveCenterTrainingScheduleLocationPreset({
        location_label: day.location_label,
        naver_map_url: day.naver_map_url,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('장소를 저장 목록에 추가했습니다.')
      refreshLibrary()
    })
  }

  function deleteLocationPreset(presetId: string) {
    startTransition(async () => {
      const result = await deleteCenterTrainingScheduleLocationPreset(presetId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('저장된 장소를 삭제했습니다.')
      refreshLibrary()
    })
  }

  function save() {
    startTransition(async () => {
      const result = await saveCenterRunningTrainingSchedule(days)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.warning) {
        toast.warning(result.warning)
        resetDraftForm()
        refreshLibrary()
        return
      }
      toast.success('주간 러닝 스케줄을 저장했습니다. 새 주차를 작성할 수 있습니다.')
      resetDraftForm()
      refreshLibrary()
    })
  }

  const mondayDate = days.find((day) => day.weekday === 0)?.schedule_date ?? ''

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          스케줄 불러오는 중…
        </CardContent>
      </Card>
    )
  }

  if (!tableReady) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-sm text-muted-foreground">
          러닝 스케줄 테이블이 없습니다.{' '}
          <code className="text-xs">add-center-running-training-schedule.sql</code>을 실행해주세요.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">주간 훈련 스케줄</CardTitle>
        <p className="text-sm text-muted-foreground">
          저장하면 성인 회원 포털에 즉시 반영되고, 작성 폼은 비워집니다. 이전 주차는 상단 저장
          목록에서 불러와 수정할 수 있습니다.
        </p>
        {!library.tableReady ? (
          <p className="text-xs text-amber-300/90">
            저장 목록·장소 프리셋을 쓰려면{' '}
            <code className="text-[11px]">add-center-running-training-schedule-library.sql</code>을
            실행해주세요.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {library.tableReady ? (
          <SavedScheduleLibrary
            library={library}
            pending={pending}
            onLoadWeek={loadWeekSnapshot}
            onApplyLocation={applyLocationPreset}
            onDeleteLocation={deleteLocationPreset}
          />
        ) : null}

        <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">이번 주 월요일 날짜</p>
          <KoreanDatePicker
            value={mondayDate}
            onChange={updateMondayScheduleDate}
            compact
            placeholder="월요일 날짜 선택"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            예: 5월 5일 선택 → 05/05(월) · 05/06(화) · … · 05/11(일)
          </p>
        </div>

        {days.map((day) => (
          <div
            key={day.weekday}
            className={cn(
              'rounded-xl border p-3 transition-opacity',
              day.is_hidden && 'border-dashed opacity-60',
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <p className="text-sm font-semibold">{TRAINING_WEEKDAY_LABELS[day.weekday]}요일</p>
                {day.schedule_date ? (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {formatTrainingScheduleDateLabel(day.schedule_date)}
                  </span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => updateDay(day.weekday, { is_hidden: !day.is_hidden })}
                aria-label={day.is_hidden ? '요일 표시' : '요일 숨김'}
                title={day.is_hidden ? '회원에게 표시' : '회원에게 숨김'}
              >
                {day.is_hidden ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="space-y-2">
              <Textarea
                value={day.training_summary}
                onChange={(event) =>
                  updateDay(day.weekday, { training_summary: event.target.value })
                }
                placeholder="간략한 훈련 내용 (예: 5km 인터벌 + 스트레칭)"
                rows={2}
                className="min-h-[60px] resize-y text-sm"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={day.location_label}
                    onChange={(event) =>
                      updateDay(day.weekday, { location_label: event.target.value })
                    }
                    placeholder="장소 (예: 한강 잠실)"
                    className="pl-9 text-sm"
                  />
                </div>
                <Input
                  value={day.naver_map_url}
                  onChange={(event) =>
                    updateDay(day.weekday, { naver_map_url: event.target.value })
                  }
                  placeholder="네이버 지도 URL (선택)"
                  className="text-sm"
                />
              </div>

              {library.tableReady ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={pending || !day.location_label.trim()}
                    onClick={() => saveLocationPreset(day)}
                  >
                    <BookmarkPlus className="mr-1 h-3.5 w-3.5" />
                    장소·주소 저장
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={pending || library.locationPresets.length === 0}
                      >
                        <FolderOpen className="mr-1 h-3.5 w-3.5" />
                        장소 불러오기
                        <ChevronDown className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-w-[min(92vw,320px)]">
                      <DropdownMenuLabel className="text-xs">저장된 장소</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {library.locationPresets.length === 0 ? (
                        <DropdownMenuItem disabled>저장된 장소 없음</DropdownMenuItem>
                      ) : (
                        library.locationPresets.map((preset) => (
                          <DropdownMenuItem
                            key={preset.id}
                            onClick={() => applyLocationPreset(day.weekday, preset)}
                            className="flex flex-col items-start gap-0.5"
                          >
                            <span className="font-medium">{preset.location_label}</span>
                            {preset.naver_map_url ? (
                              <span className="max-w-full truncate text-[11px] text-muted-foreground">
                                {preset.naver_map_url}
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>
          </div>
        ))}

        <Button type="button" onClick={save} disabled={pending} className="min-h-10">
          {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          스케줄 저장
        </Button>
      </CardContent>
    </Card>
  )
}
