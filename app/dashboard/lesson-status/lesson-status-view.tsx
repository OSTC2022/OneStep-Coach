'use client'

import dynamic from 'next/dynamic'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  format,
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  isSameMonth,
  parseISO,
  startOfMonth,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { Lesson, Instructor, AttendanceStatus } from '@/types/database'
import { getLessons } from '@/lib/actions/lessons'
import {
  cancelLessonCompletion,
  completeLessonWithSignature,
  markGuestLessonStatus,
  updateLessonAttendanceStatus,
  updateLessonEndTime,
  type GuestLessonAction,
} from '@/lib/actions/lesson-sessions'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TimeInput24 } from '@/components/ui/time-input-24'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AUTO_INSTRUCTOR_ID } from '@/lib/member-utils'
import {
  buildLessonStatusTimeSlots,
  getLessonCalendarDisplayParts,
  getRangeForView,
  getWeekDates,
  LESSON_STATUS_MAX_PER_ROW,
  sortLessonsForStatusDisplay,
  toDateKey,
  type CalendarView,
} from '@/lib/calendar-utils'
import { cn } from '@/lib/utils'
import {
  AUTO_INSTRUCTOR_CALENDAR_COLOR,
  getInstructorCalendarColor,
} from '@/lib/instructor-colors'
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Loader2,
  Pencil,
} from 'lucide-react'
import { LessonQuickRegister } from '@/components/lesson-status/lesson-quick-register'
import { LessonStatusWeightInput } from '@/components/lesson-status/lesson-status-weight-input'

const SignaturePadDialog = dynamic(
  () =>
    import('@/components/ui/signature-pad-dialog').then((m) => ({
      default: m.SignaturePadDialog,
    })),
  { ssr: false },
)

export type LessonStatusViewMode = 'day' | 'week' | 'month' | 'list'

function bodyWeightKey(memberId: string, date: string) {
  return `${memberId}:${date}`
}

const EMPTY_BODY_WEIGHT_BY_KEY: Record<string, number> = {}

interface LessonStatusViewProps {
  lessons: Lesson[]
  instructors: Instructor[]
  selectedDate: string
  initialViewMode?: LessonStatusViewMode
  showAddSchedule?: boolean
  isAdmin?: boolean
  initialBodyWeightByKey?: Record<string, number>
}

const VIEW_MODE_OPTIONS: { value: LessonStatusViewMode; label: string }[] = [
  { value: 'day', label: '일별' },
  { value: 'week', label: '주별' },
  { value: 'month', label: '월별' },
  { value: 'list', label: '목록' },
]

function groupLessonsByDate(lessons: Lesson[]) {
  const map = new Map<string, Lesson[]>()
  for (const lesson of lessons) {
    const list = map.get(lesson.lesson_date) ?? []
    list.push(lesson)
    map.set(lesson.lesson_date, list)
  }
  return map
}

function getRangeViewForMode(mode: LessonStatusViewMode): CalendarView {
  if (mode === 'list') return 'week'
  if (mode === 'day') return 'day'
  return mode
}

function getPeriodLabel(date: string, mode: LessonStatusViewMode) {
  const dateObj = parseISO(date)
  if (mode === 'day') {
    return format(dateObj, 'M월 d일 (EEE)', { locale: ko })
  }
  if (mode === 'week' || mode === 'list') {
    const week = getWeekDates(dateObj)
    const start = week[0]
    const end = week[6]
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, 'M월 d일', { locale: ko })} – ${format(end, 'd일', { locale: ko })}`
    }
    return `${format(start, 'M월 d일', { locale: ko })} – ${format(end, 'M월 d일', { locale: ko })}`
  }
  return format(dateObj, 'yyyy년 M월', { locale: ko })
}

const MEMBER_STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: '출석' },
  { value: 'cancelled', label: '취소' },
]

const GUEST_OPTIONS: { action: GuestLessonAction; label: string }[] = [
  { action: 'trial', label: '출석' },
  { action: 'cancelled', label: '취소' },
]

function formatTime(value: string | null | undefined) {
  if (!value) return null
  return value.slice(0, 5)
}

function formatStartTimeLabel(start: string) {
  return start || '시간 미정'
}

function formatLocalEndTime(date: Date) {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

function isLessonCompleted(lesson: Lesson) {
  return Boolean(lesson.session_deducted && lesson.end_time)
}

interface AthleteTileProps {
  lesson: Lesson
  isLoading: boolean
  instructorLookup: Map<string, Instructor>
  inInstructorGroup?: boolean
  canEditEndTime?: boolean
  bodyWeightByKey: Record<string, number>
  onBodyWeightChange: (memberId: string, date: string, weight: number | null) => void
  onStatusChange: (lessonId: string, status: AttendanceStatus) => void
  onGuestStatusChange: (lessonId: string, action: GuestLessonAction) => void
  onLessonCompleted: (lessonId: string, patch: Partial<Lesson>) => void
}

function resolveLessonInstructorColor(
  lesson: Lesson,
  instructorLookup: Map<string, Instructor>,
) {
  if (!lesson.instructor_id) return AUTO_INSTRUCTOR_CALENDAR_COLOR
  const instructor =
    lesson.instructor ?? instructorLookup.get(lesson.instructor_id) ?? null
  return getInstructorCalendarColor(instructor)
}

const AthleteTile = memo(function AthleteTile({
  lesson,
  isLoading,
  instructorLookup,
  inInstructorGroup = false,
  canEditEndTime = false,
  bodyWeightByKey,
  onBodyWeightChange,
  onStatusChange,
  onGuestStatusChange,
  onLessonCompleted,
}: AthleteTileProps) {
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [endTimeEditOpen, setEndTimeEditOpen] = useState(false)
  const [editEndTime, setEditEndTime] = useState('')
  const [isCompleting, setIsCompleting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isSavingEndTime, setIsSavingEndTime] = useState(false)

  const display = getLessonCalendarDisplayParts(lesson)
  const label = display.meta ? `${display.name}(${display.meta})` : display.name
  const isMemberLinked = Boolean(lesson.member_id)
  const isPresent = lesson.attendance_status === 'present'
  const isCancelled = lesson.attendance_status === 'cancelled'
  const completed = isLessonCompleted(lesson)
  const instructorBorderColor = resolveLessonInstructorColor(lesson, instructorLookup)
  const canEndLesson = isPresent && !completed && !isCancelled

  async function handleCompleteLesson(signatureData: string, endTimeInput?: string) {
    const endTime =
      endTimeInput?.trim() || formatLocalEndTime(new Date())

    setIsCompleting(true)
    const result = await completeLessonWithSignature(lesson.id, signatureData, endTime)
    setIsCompleting(false)

    if (result.error) {
      toast.error('수업 종료 실패', { description: result.error })
      return
    }

    if (result.data) {
      onLessonCompleted(lesson.id, {
        end_time: result.data.end_time,
        session_deducted: result.data.session_deducted,
        attendance_status: result.data.attendance_status,
        signature_id: result.data.signature_id,
      })
      toast.success(`${label} 수업 종료`, {
        description: `종료 ${formatTime(result.data.end_time)} · 보호자 서명 저장 · 세션 1회 차감`,
      })
    }

    setSignatureOpen(false)
  }

  async function handleCancelCompletion() {
    setIsCancelling(true)
    const result = await cancelLessonCompletion(lesson.id)
    setIsCancelling(false)

    if (result.error) {
      toast.error('종료 취소 실패', { description: result.error })
      return
    }

    if (result.data) {
      onLessonCompleted(lesson.id, {
        end_time: null,
        session_deducted: result.data.session_deducted,
        attendance_status: result.data.attendance_status,
        signature_id: null,
      })
      toast.success(`${label} 종료 취소`, {
        description: '세션 차감이 복구되었습니다. 다시 종료·서명할 수 있습니다.',
      })
    }

    setCancelOpen(false)
  }

  async function handleSaveEndTime() {
    if (!editEndTime.trim()) {
      toast.error('종료 시간을 입력해주세요.')
      return
    }

    setIsSavingEndTime(true)
    const result = await updateLessonEndTime(lesson.id, editEndTime)
    setIsSavingEndTime(false)

    if (result.error) {
      toast.error('종료 시간 수정 실패', { description: result.error })
      return
    }

    if (result.data) {
      onLessonCompleted(lesson.id, { end_time: result.data.end_time })
      toast.success('종료 시간이 수정되었습니다.', {
        description: formatTime(result.data.end_time) ?? undefined,
      })
    }

    setEndTimeEditOpen(false)
  }

  const defaultEndTimeForDialog =
    formatTime(lesson.end_time) ||
    formatLocalEndTime(new Date())

  return (
    <>
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-md bg-card/60 p-1.5',
        inInstructorGroup
          ? 'border-0'
          : cn(
              'border',
              isMemberLinked ? 'border-2' : 'border-border',
            ),
      )}
      style={
        !inInstructorGroup
          ? { borderColor: instructorBorderColor }
          : undefined
      }
    >
      {isMemberLinked && lesson.member_id ? (
        <Link
          href={`/dashboard/members/${lesson.member_id}`}
          className="truncate text-[11px] font-semibold leading-tight text-foreground hover:text-primary hover:underline"
          title={`${label} 회원 페이지`}
        >
          {label}
        </Link>
      ) : (
        <p className="truncate text-[11px] font-semibold leading-tight" title={label}>
          {label}
        </p>
      )}

      {isMemberLinked ? (
        <>
          <div className="mt-1 grid grid-cols-2 gap-0.5" role="group" aria-label={`${label} 출석 상태`}>
            {MEMBER_STATUS_OPTIONS.map((option) => {
              const isActive = lesson.attendance_status === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isLoading || completed}
                  title={option.label}
                  onClick={() => onStatusChange(lesson.id, option.value)}
                  className={cn(
                    'rounded px-0.5 py-1 text-[9px] font-medium leading-tight transition-colors',
                    isActive
                      ? option.value === 'present'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-destructive text-destructive-foreground'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                    (isLoading || completed) && 'opacity-50',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          {lesson.member_id ? (
            <LessonStatusWeightInput
              memberId={lesson.member_id}
              lessonDate={lesson.lesson_date}
              initialWeight={
                bodyWeightByKey[bodyWeightKey(lesson.member_id, lesson.lesson_date)]
              }
              disabled={isLoading || isCompleting || isCancelling}
              onWeightChange={(weight) =>
                onBodyWeightChange(lesson.member_id!, lesson.lesson_date, weight)
              }
            />
          ) : null}
          {completed ? (
            <div className="mt-1 flex gap-0.5">
              <button
                type="button"
                disabled={isLoading || isCancelling}
                title="종료 취소"
                onClick={() => setCancelOpen(true)}
                className={cn(
                  'flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded border border-primary/30 bg-primary/5 px-1 py-1 text-[9px] font-medium text-primary transition-colors hover:bg-primary/15',
                  (isLoading || isCancelling) && 'opacity-50',
                )}
              >
                {isCancelling ? (
                  <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                )}
                종료 {formatTime(lesson.end_time)}
              </button>
              {canEditEndTime ? (
                <Popover
                  open={endTimeEditOpen}
                  onOpenChange={(open) => {
                    if (!isSavingEndTime) {
                      setEndTimeEditOpen(open)
                      if (open) {
                        setEditEndTime(formatTime(lesson.end_time) ?? '')
                      }
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isLoading || isSavingEndTime}
                      title="종료 시간 수정"
                      className={cn(
                        'shrink-0 rounded border border-border bg-muted/40 px-1 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                        (isLoading || isSavingEndTime) && 'opacity-50',
                      )}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 space-y-2 p-3" align="end">
                    <Label htmlFor={`end-time-${lesson.id}`} className="text-xs">
                      종료 시간
                    </Label>
                    <TimeInput24
                      id={`end-time-${lesson.id}`}
                      value={editEndTime}
                      onChange={setEditEndTime}
                      compact
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={isSavingEndTime || !editEndTime.trim()}
                      onClick={() => void handleSaveEndTime()}
                    >
                      {isSavingEndTime ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          저장 중
                        </>
                      ) : (
                        '저장'
                      )}
                    </Button>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              disabled={isLoading || isCompleting || !canEndLesson}
              title={
                isCancelled
                  ? '취소된 수업은 종료할 수 없습니다'
                  : !isPresent
                    ? '출석 처리 후 종료·서명할 수 있습니다'
                    : `${label} 보호자 서명 받기`
              }
              onClick={() => setSignatureOpen(true)}
              className={cn(
                'mt-1 w-full rounded border border-primary/40 bg-primary/10 px-1 py-1 text-[9px] font-semibold leading-tight text-primary transition-colors hover:bg-primary/20',
                (isLoading || isCompleting || !canEndLesson) && 'opacity-50',
              )}
            >
              {isCompleting ? (
                <span className="inline-flex items-center justify-center gap-0.5">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  처리 중
                </span>
              ) : (
                '종료·서명'
              )}
            </button>
          )}
        </>
      ) : (
        <div className="mt-1 grid grid-cols-2 gap-0.5" role="group" aria-label={`${label} 출석/취소`}>
          {GUEST_OPTIONS.map((option) => {
            const isActive = option.action === 'trial' ? isPresent : isCancelled
            return (
              <button
                key={option.action}
                type="button"
                disabled={isLoading}
                title={option.label}
                onClick={() => onGuestStatusChange(lesson.id, option.action)}
                className={cn(
                  'rounded px-0.5 py-1 text-[9px] font-medium leading-tight transition-colors',
                  isActive
                    ? option.action === 'trial'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-destructive text-destructive-foreground'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                  isLoading && 'opacity-50',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>

    {signatureOpen && (
      <SignaturePadDialog
        open
        onOpenChange={(open) => {
          if (!open && !isCompleting) setSignatureOpen(false)
        }}
        title={`${label} 수업 종료`}
        description="해당 회원의 보호자(부모님)께 직접 서명을 받아주세요."
        memberLabel={label}
        confirmLabel="종료 확인"
        isSubmitting={isCompleting}
        canEditEndTime={canEditEndTime}
        defaultEndTime={defaultEndTimeForDialog}
        showPastLessonFinder
        pastLessonMemberId={lesson.member_id ?? lesson.member?.id}
        onPastLessonUpdated={onLessonCompleted}
        onConfirm={(signatureData, endTime) =>
          void handleCompleteLesson(signatureData, endTime)
        }
      />
    )}

    <AlertDialog
      open={cancelOpen}
      onOpenChange={(open) => {
        if (!isCancelling) setCancelOpen(open)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>종료 취소</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{label}</span> 수업의 종료와
            보호자 서명을 취소할까요? 세션 차감도 되돌려집니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCancelling}>아니요</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={isCancelling}
            onClick={() => void handleCancelCompletion()}
          >
            {isCancelling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                취소 중...
              </>
            ) : (
              '예'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
})

interface TimeSlotsPanelProps {
  lessons: Lesson[]
  instructors: Instructor[]
  instructorLookup: Map<string, Instructor>
  isUpdating: string | null
  canEditEndTime?: boolean
  onStatusChange: (lessonId: string, status: AttendanceStatus) => void
  onGuestStatusChange: (lessonId: string, action: GuestLessonAction) => void
  onLessonCompleted: (lessonId: string, patch: Partial<Lesson>) => void
  bodyWeightByKey: Record<string, number>
  onBodyWeightChange: (memberId: string, date: string, weight: number | null) => void
  emptyMessage?: string
}

const TimeSlotsPanel = memo(function TimeSlotsPanel({
  lessons,
  instructors,
  instructorLookup,
  isUpdating,
  canEditEndTime = false,
  bodyWeightByKey,
  onBodyWeightChange,
  onStatusChange,
  onGuestStatusChange,
  onLessonCompleted,
  emptyMessage = '등록된 수업이 없습니다.',
}: TimeSlotsPanelProps) {
  const timeSlots = useMemo(
    () => buildLessonStatusTimeSlots(lessons, instructors),
    [lessons, instructors],
  )

  function resolveInstructorColor(instructorId: string) {
    if (instructorId === AUTO_INSTRUCTOR_ID) return AUTO_INSTRUCTOR_CALENDAR_COLOR
    return getInstructorCalendarColor(instructorLookup.get(instructorId) ?? null)
  }

  if (lessons.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {timeSlots.map((slot) =>
        slot.rows.map((rowChunks, rowIndex) => (
          <div
            key={`${slot.start || 'none'}-${rowIndex}`}
            className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5"
          >
            <div className="w-11 shrink-0 pt-1 text-center">
              {rowIndex === 0 ? (
                <>
                  <p className="text-xs font-bold text-primary leading-none">
                    {formatStartTimeLabel(slot.start)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {slot.total}명
                  </p>
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground">···</p>
              )}
            </div>

            <div
              className="grid min-w-0 flex-1 gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${LESSON_STATUS_MAX_PER_ROW}, minmax(0, 1fr))`,
              }}
            >
              {rowChunks.map((chunk) => {
                const color = resolveInstructorColor(chunk.instructorId)
                const span = Math.min(chunk.lessons.length, LESSON_STATUS_MAX_PER_ROW)
                return (
                  <div
                    key={`${chunk.instructorId}-${chunk.lessons[0]?.id}`}
                    className="grid min-w-0 gap-1 rounded-md border-2 bg-card/30 p-0.5"
                    style={{
                      gridColumn: `span ${span}`,
                      borderColor: color,
                      gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))`,
                    }}
                  >
                    {chunk.lessons.map((lesson) => (
                      <AthleteTile
                        key={lesson.id}
                        lesson={lesson}
                        isLoading={isUpdating === lesson.id}
                        canEditEndTime={canEditEndTime}
                        instructorLookup={instructorLookup}
                        inInstructorGroup
                        bodyWeightByKey={bodyWeightByKey}
                        onBodyWeightChange={onBodyWeightChange}
                        onStatusChange={onStatusChange}
                        onGuestStatusChange={onGuestStatusChange}
                        onLessonCompleted={onLessonCompleted}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )),
      )}
    </div>
  )
})

export function LessonStatusView({
  lessons: initialLessons,
  instructors,
  selectedDate,
  initialViewMode = 'day',
  showAddSchedule = false,
  isAdmin = false,
  initialBodyWeightByKey = EMPTY_BODY_WEIGHT_BY_KEY,
}: LessonStatusViewProps) {
  const [currentDate, setCurrentDate] = useState(selectedDate)
  const [viewMode, setViewMode] = useState<LessonStatusViewMode>(initialViewMode)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [lessons, setLessons] = useState(() =>
    sortLessonsForStatusDisplay(initialLessons, instructors),
  )
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const [isLoadingDate, setIsLoadingDate] = useState(false)
  const quickRegisterPanelRef = useRef<HTMLDivElement>(null)
  const [bodyWeightByKey, setBodyWeightByKey] = useState(initialBodyWeightByKey)
  const bodyWeightSeedRef = useRef(initialBodyWeightByKey)
  bodyWeightSeedRef.current = initialBodyWeightByKey

  const dateObj = parseISO(currentDate)
  const today = format(new Date(), 'yyyy-MM-dd')
  const isToday =
    viewMode === 'day'
      ? currentDate === today
      : viewMode === 'month'
        ? isSameMonth(dateObj, new Date())
        : getWeekDates(dateObj).some((d) => toDateKey(d) === today)

  useEffect(() => {
    setCurrentDate(selectedDate)
    setViewMode(initialViewMode)
    setLessons(sortLessonsForStatusDisplay(initialLessons, instructors))
  }, [selectedDate, initialViewMode, initialLessons, instructors])

  useEffect(() => {
    setBodyWeightByKey(bodyWeightSeedRef.current)
  }, [selectedDate, initialViewMode])

  const handleBodyWeightChange = useCallback(
    (memberId: string, date: string, weight: number | null) => {
      setBodyWeightByKey((prev) => {
        const key = bodyWeightKey(memberId, date)
        if (weight == null) {
          const { [key]: _removed, ...rest } = prev
          return rest
        }
        return { ...prev, [key]: weight }
      })
    },
    [],
  )

  const instructorLookup = useMemo(
    () => new Map(instructors.map((instructor) => [instructor.id, instructor])),
    [instructors],
  )

  const stats = useMemo(
    () => ({
      total: lessons.length,
      athletes: lessons.filter((l) => l.member_id).length,
      unregistered: lessons.filter((l) => !l.member_id).length,
      present: lessons.filter((l) => l.attendance_status === 'present').length,
      cancelled: lessons.filter((l) => l.attendance_status === 'cancelled').length,
    }),
    [lessons],
  )

  const lessonsByDate = useMemo(() => groupLessonsByDate(lessons), [lessons])

  const periodLabel = useMemo(
    () => getPeriodLabel(currentDate, viewMode),
    [currentDate, viewMode],
  )

  const viewModeLabel =
    VIEW_MODE_OPTIONS.find((option) => option.value === viewMode)?.label ?? '일별'

  const updateLessonInPlace = useCallback(
    (lessonId: string, patch: Partial<Lesson>) => {
      setLessons((prev) =>
        prev.map((lesson) => (lesson.id === lessonId ? { ...lesson, ...patch } : lesson)),
      )
    },
    [],
  )

  const handleQuickLessonCreated = useCallback(
    (lesson: Lesson) => {
      setLessons((prev) => {
        if (prev.some((item) => item.id === lesson.id)) {
          return sortLessonsForStatusDisplay(prev, instructors)
        }
        return sortLessonsForStatusDisplay([...prev, lesson], instructors)
      })
    },
    [instructors],
  )

  const syncUrl = useCallback((date: string, mode: LessonStatusViewMode) => {
    const params = new URLSearchParams({ date })
    if (mode !== 'day') params.set('view', mode)
    window.history.replaceState(null, '', `/dashboard/lesson-status?${params}`)
  }, [])

  const loadLessons = useCallback(
    async (anchorDate: string, mode: LessonStatusViewMode) => {
      setIsLoadingDate(true)
      try {
        if (mode === 'day') {
          const nextLessons = await getLessons({ date: anchorDate })
          setLessons(sortLessonsForStatusDisplay(nextLessons, instructors))
          return
        }
        const { dateFrom, dateTo } = getRangeForView(
          parseISO(anchorDate),
          getRangeViewForMode(mode),
        )
        const nextLessons = await getLessons({ dateFrom, dateTo })
        setLessons(sortLessonsForStatusDisplay(nextLessons, instructors))
      } catch {
        toast.error('수업 목록을 불러오지 못했습니다.')
      } finally {
        setIsLoadingDate(false)
      }
    },
    [instructors],
  )

  const navigatePeriod = useCallback(
    async (offset: -1 | 1) => {
      let nextDate = currentDate
      const base = parseISO(currentDate)
      if (viewMode === 'day') {
        nextDate = format(addDays(base, offset), 'yyyy-MM-dd')
      } else if (viewMode === 'month') {
        nextDate = format(addMonths(base, offset), 'yyyy-MM-dd')
      } else {
        nextDate = format(addWeeks(base, offset), 'yyyy-MM-dd')
      }
      setCurrentDate(nextDate)
      syncUrl(nextDate, viewMode)
      await loadLessons(nextDate, viewMode)
    },
    [currentDate, viewMode, loadLessons, syncUrl],
  )

  const goToToday = useCallback(async () => {
    setCurrentDate(today)
    syncUrl(today, viewMode)
    await loadLessons(today, viewMode)
  }, [today, viewMode, loadLessons, syncUrl])

  const handleDateChange = useCallback(
    async (nextDate: string) => {
      if (!nextDate) return
      setCurrentDate(nextDate)
      setDatePickerOpen(false)
      syncUrl(nextDate, viewMode)
      await loadLessons(nextDate, viewMode)
    },
    [viewMode, loadLessons, syncUrl],
  )

  const handleViewModeChange = useCallback(
    async (mode: LessonStatusViewMode) => {
      setViewMode(mode)
      setDatePickerOpen(false)
      syncUrl(currentDate, mode)
      await loadLessons(currentDate, mode)
    },
    [currentDate, loadLessons, syncUrl],
  )

  const handleStatusChange = useCallback(async (lessonId: string, status: AttendanceStatus) => {
    setIsUpdating(lessonId)
    const result = await updateLessonAttendanceStatus(lessonId, status)
    setIsUpdating(null)

    if (result.error) {
      toast.error('출석 처리 실패', { description: result.error })
      return
    }

    updateLessonInPlace(lessonId, {
      ...(result.data ?? {}),
      attendance_status: status,
    })
  }, [updateLessonInPlace])

  const handleGuestStatusChange = useCallback(async (lessonId: string, action: GuestLessonAction) => {
    setIsUpdating(lessonId)
    const result = await markGuestLessonStatus(lessonId, action)
    setIsUpdating(null)

    if (result.error) {
      toast.error('처리 실패', { description: result.error })
      return
    }

    if (result.data) {
      updateLessonInPlace(lessonId, {
        lesson_type: result.data.lesson_type,
        attendance_status: result.data.attendance_status,
      })
    }
  }, [updateLessonInPlace])

  const panelProps = {
    instructors,
    instructorLookup,
    isUpdating,
    canEditEndTime: isAdmin,
    bodyWeightByKey,
    onBodyWeightChange: handleBodyWeightChange,
    onStatusChange: handleStatusChange,
    onGuestStatusChange: handleGuestStatusChange,
    onLessonCompleted: updateLessonInPlace,
  }

  const weekDates = getWeekDates(dateObj).map((d) => toDateKey(d))
  const monthStart = startOfMonth(dateObj)
  const monthEnd = endOfMonth(dateObj)

  function renderWeekOrMonthDays(mode: 'week' | 'month') {
    const dateKeys =
      mode === 'week'
        ? weekDates.filter((key) => (lessonsByDate.get(key)?.length ?? 0) > 0)
        : Array.from(lessonsByDate.keys())
            .filter((key) => {
              const d = parseISO(key)
              return d >= monthStart && d <= monthEnd
            })
            .sort()

    if (dateKeys.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          <ListChecks className="mx-auto mb-2 h-6 w-6 opacity-40" />
          <p>등록된 수업이 없습니다.</p>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {dateKeys.map((dateKey) => {
          const dayLessons = lessonsByDate.get(dateKey) ?? []
          if (mode === 'month' && dayLessons.length === 0) return null
          return (
            <section key={dateKey}>
              <div className="mb-1.5 flex items-center gap-2 border-b border-border/60 pb-1">
                <span className="text-xs font-semibold text-primary">
                  {format(parseISO(dateKey), 'M월 d일 (EEE)', { locale: ko })}
                </span>
                {dateKey === today && (
                  <span className="text-[10px] font-medium text-primary/80">오늘</span>
                )}
                <span className="text-[10px] text-muted-foreground">{dayLessons.length}건</span>
              </div>
              <TimeSlotsPanel
                lessons={dayLessons}
                {...panelProps}
                emptyMessage="이 날 수업이 없습니다."
              />
            </section>
          )
        })}
      </div>
    )
  }

  function renderListView() {
    const dateKeys = Array.from(lessonsByDate.keys()).sort()
    if (dateKeys.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          <ListChecks className="mx-auto mb-2 h-6 w-6 opacity-40" />
          <p>등록된 수업이 없습니다.</p>
        </div>
      )
    }

    return (
      <div className="rounded-md border border-border bg-card/40">
        <div className="border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">{periodLabel}</span>
        </div>
        <div className="divide-y divide-border/60">
          {dateKeys.map((dateKey) => {
            const dayLessons = lessonsByDate.get(dateKey) ?? []
            return (
              <section key={dateKey} className="px-3 py-2">
                <p className="mb-2 text-xs font-bold text-primary">
                  {format(parseISO(dateKey), 'M월 d일 (EEE)', { locale: ko })}
                  {dateKey === today ? (
                    <span className="ml-1.5 font-medium text-primary/80">오늘</span>
                  ) : null}
                </p>
                <div className="space-y-2">
                  {dayLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2"
                    >
                      <div className="w-11 shrink-0 pt-1 text-center">
                        <p className="text-xs font-bold text-primary leading-none">
                          {formatStartTimeLabel(formatTime(lesson.start_time) ?? '')}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <AthleteTile
                          lesson={lesson}
                          isLoading={isUpdating === lesson.id}
                          canEditEndTime={isAdmin}
                          instructorLookup={instructorLookup}
                          bodyWeightByKey={bodyWeightByKey}
                          onBodyWeightChange={handleBodyWeightChange}
                          onStatusChange={handleStatusChange}
                          onGuestStatusChange={handleGuestStatusChange}
                          onLessonCompleted={updateLessonInPlace}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Button
            type="button"
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            className="h-8 shrink-0 px-3 text-xs font-semibold"
            disabled={isLoadingDate}
            onClick={() => void handleViewModeChange('list')}
          >
            <ListChecks className="mr-1 h-3.5 w-3.5" />
            목록
          </Button>

          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={isLoadingDate}
                onClick={() => void navigatePeriod(-1)}
                aria-label="이전"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={isToday ? 'default' : 'outline'}
                size="sm"
                className="h-8 min-w-[52px] px-2.5 text-xs font-semibold"
                disabled={isLoadingDate || isToday}
                onClick={() => void goToToday()}
              >
                오늘
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={isLoadingDate}
                onClick={() => void navigatePeriod(1)}
                aria-label="다음"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left text-sm font-semibold transition-colors hover:bg-muted"
                  disabled={isLoadingDate}
                >
                  {periodLabel}
                  <span className="text-xs font-medium text-muted-foreground">
                    · {viewModeLabel}
                  </span>
                  {isLoadingDate ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,18rem)] p-3" align="start">
                <p className="mb-2 text-xs font-medium text-muted-foreground">보기 방식</p>
                <div className="mb-3 grid grid-cols-3 gap-1">
                  {VIEW_MODE_OPTIONS.filter((option) => option.value !== 'list').map(
                    (option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={viewMode === option.value ? 'default' : 'outline'}
                        className="h-8 px-1 text-xs"
                        onClick={() => void handleViewModeChange(option.value)}
                      >
                        {option.label}
                      </Button>
                    ),
                  )}
                </div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">날짜 이동</p>
                <KoreanDatePicker
                  value={currentDate}
                  onChange={(value) => void handleDateChange(value)}
                  compact
                  className="w-full"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <LessonQuickRegister
            lessonDate={currentDate}
            instructors={instructors}
            onCreated={handleQuickLessonCreated}
            panelContainerRef={quickRegisterPanelRef}
          />
          <Link href="/dashboard/calendar">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              <CalendarDays className="h-3.5 w-3.5 mr-1" />
              캘린더
            </Button>
          </Link>
          {showAddSchedule && (
            <Link href="/dashboard/calendar">
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
                <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                스케줄 추가
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div ref={quickRegisterPanelRef} className="empty:hidden" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          전체 <strong className="text-foreground">{stats.total}</strong>
        </span>
        <span className="text-border">|</span>
        <span>
          선수 <strong className="text-foreground">{stats.athletes}</strong>
        </span>
        <span className="text-border">|</span>
        <span>
          미등록 <strong className="text-foreground">{stats.unregistered}</strong>
        </span>
        <span className="text-border">|</span>
        <span>
          출석 <strong className="text-green-400">{stats.present}</strong>
        </span>
        <span className="text-border">|</span>
        <span>
          취소 <strong className="text-red-400">{stats.cancelled}</strong>
        </span>
      </div>

      {viewMode === 'day' ? (
        lessons.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            <ListChecks className="mx-auto mb-2 h-6 w-6 opacity-40" />
            <p>등록된 수업이 없습니다.</p>
          </div>
        ) : (
          <TimeSlotsPanel lessons={lessons} {...panelProps} />
        )
      ) : null}

      {viewMode === 'week' ? renderWeekOrMonthDays('week') : null}
      {viewMode === 'month' ? renderWeekOrMonthDays('month') : null}
      {viewMode === 'list' ? renderListView() : null}
    </div>
  )
}
