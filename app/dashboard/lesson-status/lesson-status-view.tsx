'use client'

import dynamic from 'next/dynamic'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { getLessonsForStatusView, updateLesson } from '@/lib/actions/lessons'
import { useCalendarLessonHistory } from '@/lib/calendar-lesson-history'
import { isEditableTarget, matchCalendarUndoRedo } from '@/lib/calendar-shortcuts'
import {
  lessonAttendanceLocalPatch,
  restoreLessonAttendanceSnapshot,
} from '@/lib/lesson-status-attendance-restore'
import {
  cancelLessonCompletion,
  clearLessonAttendanceCheck,
  completeLessonWithSignature,
  markGuestLessonStatus,
  updateAthleticsClubAttendanceStatus,
  updateLessonAttendanceStatus,
  updateLessonEndTime,
  type GuestLessonAction,
} from '@/lib/actions/lesson-sessions'
import { isAttendanceMarked, isLessonCompletedRecord, isLessonCountedAsMemberAttendance } from '@/lib/lesson-record-utils'
import { isAthleticsClubLessonType, normalizeLessonType } from '@/lib/lesson-types'
import {
  isGroupLessonAttendanceMarked,
  parseGroupAttendanceCheckedInAt,
} from '@/lib/group-lesson-attendance'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TimeInput24 } from '@/components/ui/time-input-24'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  findLessonStatusScrollSlotStart,
  getLessonCalendarDisplayParts,
  getRangeForView,
  getWeekDates,
  LESSON_STATUS_MAX_PER_ROW,
  sortLessonsForStatusDisplay,
  toDateKey,
  type CalendarView,
} from '@/lib/calendar-utils'
import { formatLessonCompletionRemainingLabel } from '@/lib/lesson-completion-summary'
import { formatSessionOverageAlert } from '@/lib/session-package-utils'
import type { SignaturePadSuccessSummary } from '@/components/ui/signature-pad-dialog'
import { cn } from '@/lib/utils'
import {
  AUTO_INSTRUCTOR_BORDER_COLOR,
  getInstructorCalendarColor,
  isAutoAssignedLesson,
  resolveLessonDisplayColor,
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
  Redo2,
  RefreshCw,
  Undo2,
  UserRound,
} from 'lucide-react'
import { LessonQuickRegister } from '@/components/lesson-status/lesson-quick-register'
import { LessonMemberLinkDialog } from '@/components/lesson-status/lesson-member-link-dialog'
import { LessonStatusWeightInput } from '@/components/lesson-status/lesson-status-weight-input'

const SignaturePadDialog = dynamic(
  () =>
    import('@/components/ui/signature-pad-dialog').then((m) => ({
      default: m.SignaturePadDialog,
    })),
  { ssr: false },
)

const LessonCreateDialog = dynamic(
  () =>
    import('@/app/dashboard/calendar/lesson-create-dialog').then((m) => ({
      default: m.LessonCreateDialog,
    })),
  { ssr: false },
)

export type LessonStatusViewMode = 'day' | 'week' | 'month' | 'list'

type LessonStatusGridViewMode = Exclude<LessonStatusViewMode, 'list'>

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
  return isLessonCompletedRecord(lesson)
}

interface AthleteTileProps {
  lesson: Lesson
  isLoading: boolean
  instructors: Instructor[]
  instructorLookup: Map<string, Instructor>
  inInstructorGroup?: boolean
  compact?: boolean
  expanded?: boolean
  canEditEndTime?: boolean
  bodyWeightByKey: Record<string, number>
  onBodyWeightChange: (memberId: string, date: string, weight: number | null) => void
  onStatusChange: (lessonId: string, status: AttendanceStatus) => void
  onClearAttendanceCheck: (lessonId: string) => void
  onGuestStatusChange: (lessonId: string, action: GuestLessonAction) => void
  onLessonCompleted: (lessonId: string, patch: Partial<Lesson>) => void
  onMemberLinked: (originalLessonId: string, lesson: Lesson, deletedIds?: string[]) => void
  onLessonEdited: (lesson: Lesson) => void
  onLessonDeleted: (lessonIds: string[]) => void
}

function resolveLessonInstructorColor(
  lesson: Lesson,
  instructorLookup: Map<string, Instructor>,
) {
  return resolveLessonDisplayColor(lesson, [...instructorLookup.values()])
}

const AthleteTile = memo(function AthleteTile({
  lesson,
  isLoading,
  instructors,
  instructorLookup,
  inInstructorGroup = false,
  compact = false,
  expanded = false,
  canEditEndTime = false,
  bodyWeightByKey,
  onBodyWeightChange,
  onStatusChange,
  onClearAttendanceCheck,
  onGuestStatusChange,
  onLessonCompleted,
  onMemberLinked,
  onLessonEdited,
  onLessonDeleted,
}: AthleteTileProps) {
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [memberLinkOpen, setMemberLinkOpen] = useState(false)
  const [editLessonOpen, setEditLessonOpen] = useState(false)
  const [signatureDefaultEndTime, setSignatureDefaultEndTime] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [endTimeEditOpen, setEndTimeEditOpen] = useState(false)
  const [editEndTime, setEditEndTime] = useState('')
  const [isCompleting, setIsCompleting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isSavingEndTime, setIsSavingEndTime] = useState(false)
  const [completionRemainingLabel, setCompletionRemainingLabel] = useState<string | null>(
    null,
  )

  const display = getLessonCalendarDisplayParts(lesson)
  const label = display.meta ? `${display.name}(${display.meta})` : display.name
  const isMemberLinked = Boolean(lesson.member_id)
  const isAthleticsGroup =
    !isMemberLinked && isAthleticsClubLessonType(lesson.lesson_type)
  const isPresent = lesson.attendance_status === 'present'
  const isCancelled = lesson.attendance_status === 'cancelled'
  const completed = isLessonCompleted(lesson)
  const isPresentMarked = isMemberLinked
    ? completed || (isPresent && isAttendanceMarked(lesson))
    : isAthleticsGroup
      ? isGroupLessonAttendanceMarked(lesson)
      : false
  const isInstructorUnassigned = isAutoAssignedLesson(lesson)
  const instructorBorderColor = resolveLessonInstructorColor(lesson, instructorLookup)
  const lessonTypeLabel = normalizeLessonType(lesson.lesson_type)
  const canEndLesson = isPresentMarked && !completed && !isCancelled
  const isGuestTrialMarked = lesson.lesson_type === '체험레슨' && !isCancelled
  const instructorName =
    lesson.instructor?.name ??
    (lesson.instructor_id
      ? instructorLookup.get(lesson.instructor_id)?.name
      : undefined) ??
    '—'
  const memberPickerOptions = useMemo(
    () =>
      lesson.member
        ? [
            {
              id: lesson.member.id,
              name: lesson.member.name,
              sport: lesson.member.sport,
              age: lesson.member.age,
              birth_date: lesson.member.birth_date,
            },
          ]
        : [],
    [lesson.member],
  )
  const statusLabel = completed
    ? `종료 ${formatTime(lesson.end_time) ?? ''}`.trim()
    : isCancelled
      ? '취소'
      : isPresentMarked
        ? '출석'
        : isPresent
          ? '출석(미체크)'
          : '대기'
  const showActions = !compact

  async function handleCompleteLesson(
    signatureData: string,
    endTimeInput?: string,
  ): Promise<SignaturePadSuccessSummary | null> {
    const endTime = endTimeInput?.trim()
    if (!endTime) {
      toast.error('종료 시간을 확인할 수 없습니다.')
      return null
    }

    setIsCompleting(true)
    const result = await completeLessonWithSignature(lesson.id, signatureData, endTime)
    setIsCompleting(false)

    if (result.error) {
      toast.error('수업 종료 실패', { description: result.error })
      return null
    }

    if (result.data) {
      const remainingLabel = formatLessonCompletionRemainingLabel(result.data)
      setCompletionRemainingLabel(remainingLabel)

      onLessonCompleted(lesson.id, {
        id: result.data.id,
        end_time: result.data.end_time,
        session_deducted: result.data.session_deducted,
        attendance_status: result.data.attendance_status,
        signature_id: result.data.signature_id,
        ...(result.data.member_remaining_sessions != null && lesson.member
          ? {
              member: {
                ...lesson.member,
                remaining_sessions: result.data.member_remaining_sessions,
              },
            }
          : {}),
      })

      if (result.data.session_overage && result.data.session_overage > 0) {
        toast.warning(
          formatSessionOverageAlert(result.data.session_overage, {
            noPackage: result.data.no_session_package,
          }),
          { duration: 8000 },
        )
      }

      return { remainingLabel }
    }

    return null
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
      setCompletionRemainingLabel(null)
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
      setEditEndTime(formatTime(result.data.end_time) ?? '')
      toast.success('종료 시간이 수정되었습니다.', {
        description: formatTime(result.data.end_time) ?? undefined,
      })
      setEndTimeEditOpen(false)
    }
  }

  function openSignatureDialog() {
    setSignatureDefaultEndTime(formatLocalEndTime(new Date()))
    setSignatureOpen(true)
  }

  return (
    <>
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-md bg-card/60 p-1.5',
        expanded && 'p-2',
        inInstructorGroup
          ? 'border-0'
          : cn(
              'border',
              isMemberLinked ? 'border-2' : 'border-border',
              isInstructorUnassigned && 'border-border',
            ),
      )}
      style={
        !inInstructorGroup
          ? {
              borderColor: isInstructorUnassigned
                ? AUTO_INSTRUCTOR_BORDER_COLOR
                : instructorBorderColor,
            }
          : undefined
      }
    >
      {isMemberLinked && lesson.member_id ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'truncate text-left font-semibold leading-tight text-foreground hover:text-primary hover:underline',
                expanded ? 'text-sm' : compact ? 'text-xs' : 'text-[11px]',
              )}
              title={`${label} — 수업 수정 또는 회원 페이지`}
            >
              {label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[9.5rem]">
            <DropdownMenuItem onSelect={() => setEditLessonOpen(true)}>
              <Pencil className="size-4" />
              수업 수정
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/members/${lesson.member_id}`}>
                <UserRound className="size-4" />
                회원 페이지
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : isAthleticsGroup ? (
        <p
          className={cn(
            'truncate font-semibold leading-tight',
            expanded ? 'text-sm' : compact ? 'text-xs' : 'text-[11px]',
          )}
          title={label}
        >
          {label}
        </p>
      ) : (
        <>
          <p
            className={cn(
              'truncate font-semibold leading-tight text-primary',
              expanded ? 'text-sm' : compact ? 'text-xs' : 'text-[11px]',
            )}
            title={label}
          >
            {label}
          </p>
          {showActions ? (
            <div
              className="mt-1 grid grid-cols-2 gap-0.5"
              role="group"
              aria-label={`${label} 회원 연결 및 수정`}
            >
              <button
                type="button"
                onClick={() => setMemberLinkOpen(true)}
                className="rounded bg-primary/15 px-0.5 py-1 text-[9px] font-medium leading-tight text-primary transition-colors hover:bg-primary/25"
              >
                회원 연결
              </button>
              <button
                type="button"
                onClick={() => setEditLessonOpen(true)}
                className="rounded bg-muted/40 px-0.5 py-1 text-[9px] font-medium leading-tight text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                수정
              </button>
            </div>
          ) : null}
        </>
      )}

      {!isMemberLinked && !isAthleticsGroup ? (
        <LessonMemberLinkDialog
          open={memberLinkOpen}
          onOpenChange={setMemberLinkOpen}
          lesson={lesson}
          onLinked={onMemberLinked}
        />
      ) : null}

      {!isAthleticsGroup ? (
        <LessonCreateDialog
          open={editLessonOpen}
          onOpenChange={setEditLessonOpen}
          lesson={lesson}
          members={memberPickerOptions}
          instructors={instructors}
          onSaved={(saved) => {
            onLessonEdited(saved)
            setEditLessonOpen(false)
          }}
          onDeleted={(lessonIds) => {
            onLessonDeleted(lessonIds)
            setEditLessonOpen(false)
          }}
        />
      ) : null}

      <p
        className={cn(
          'mt-0.5 truncate text-muted-foreground',
          expanded ? 'text-xs' : 'text-[10px]',
        )}
        title={`수업유형 ${lessonTypeLabel}`}
      >
        {lessonTypeLabel}
      </p>

      {compact ? (
        <>
          {isInstructorUnassigned ? (
            <p
              className="mt-0.5 rounded border bg-muted/20 px-1 py-0.5 text-center text-[9px] font-medium text-muted-foreground"
              style={{ borderColor: AUTO_INSTRUCTOR_BORDER_COLOR }}
            >
              강사 미지정
            </p>
          ) : (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              담당: {instructorName}
            </p>
          )}
          <p className="mt-0.5 text-[10px] font-medium text-primary/90">{statusLabel}</p>
        </>
      ) : null}

      {showActions && (isMemberLinked || isAthleticsGroup) ? (
        <>
          <div className="mt-1 grid grid-cols-2 gap-0.5" role="group" aria-label={`${label} 출석 상태`}>
            {MEMBER_STATUS_OPTIONS.map((option) => {
              const isActive =
                option.value === 'present'
                  ? isPresentMarked
                  : isCancelled
              const canClearPresent =
                option.value === 'present' && isPresentMarked && !completed
              const canClearCancelled =
                option.value === 'cancelled' && isCancelled && !completed
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isLoading || completed}
                  title={
                    canClearPresent
                      ? '출석 취소'
                      : canClearCancelled
                        ? '취소 해제'
                        : option.label
                  }
                  onClick={() => {
                    if (canClearPresent || canClearCancelled) {
                      onClearAttendanceCheck(lesson.id)
                      return
                    }
                    onStatusChange(lesson.id, option.value)
                  }}
                  className={cn(
                    'rounded px-0.5 py-1 text-[9px] font-medium leading-tight transition-colors',
                    isActive
                      ? option.value === 'present'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-destructive text-destructive-foreground'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                    (isLoading || completed) && 'opacity-50',
                    (canClearPresent || canClearCancelled) && 'hover:opacity-90',
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
            <>
            {completionRemainingLabel ||
            (lesson.member?.remaining_sessions != null &&
              lesson.member.remaining_sessions >= 0) ? (
              <div className="mt-1 rounded border border-primary/25 bg-primary/5 px-1 py-1.5 text-center">
                <p className="text-[9px] font-semibold text-primary">감사합니다</p>
                <p className="text-[9px] tabular-nums text-muted-foreground">
                  {completionRemainingLabel ??
                    `남은 수업 ${lesson.member!.remaining_sessions}회`}
                </p>
              </div>
            ) : null}
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
                <>
                  <button
                    type="button"
                    disabled={isLoading || isSavingEndTime}
                    title="종료 시간 수정"
                    onClick={() => {
                      setEditEndTime(formatTime(lesson.end_time) ?? '')
                      setEndTimeEditOpen(true)
                    }}
                    className={cn(
                      'shrink-0 rounded border border-border bg-muted/40 px-1 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                      (isLoading || isSavingEndTime) && 'opacity-50',
                    )}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  <Dialog
                    open={endTimeEditOpen}
                    onOpenChange={(open) => {
                      if (!isSavingEndTime) setEndTimeEditOpen(open)
                    }}
                  >
                    <DialogContent
                      mobileSheet
                      showCloseButton={false}
                      className="gap-4 sm:max-w-sm"
                      onPointerDownOutside={() => setEndTimeEditOpen(false)}
                    >
                      <DialogHeader className="text-left">
                        <DialogTitle className="text-base">종료 시간 수정</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-2">
                        <Label htmlFor={`end-time-${lesson.id}`} className="text-xs">
                          종료 시간
                        </Label>
                        <TimeInput24
                          id={`end-time-${lesson.id}`}
                          value={editEndTime}
                          onChange={setEditEndTime}
                        />
                      </div>
                      <DialogFooter className="gap-2 sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSavingEndTime}
                          onClick={() => setEndTimeEditOpen(false)}
                        >
                          취소
                        </Button>
                        <Button
                          type="button"
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
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              ) : null}
            </div>
            </>
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
              onClick={openSignatureDialog}
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
      ) : showActions ? (
        <div className="mt-1 grid grid-cols-2 gap-0.5" role="group" aria-label={`${label} 출석/취소`}>
          {GUEST_OPTIONS.map((option) => {
            const isActive =
              option.action === 'trial' ? isGuestTrialMarked : isCancelled
            const canClearTrial =
              option.action === 'trial' && isGuestTrialMarked
            const canClearCancelled =
              option.action === 'cancelled' && isCancelled
            return (
              <button
                key={option.action}
                type="button"
                disabled={isLoading}
                title={
                  canClearTrial
                    ? '출석 취소'
                    : canClearCancelled
                      ? '취소 해제'
                      : option.label
                }
                onClick={() => {
                  if (canClearTrial || canClearCancelled) {
                    onGuestStatusChange(lesson.id, 'unset')
                    return
                  }
                  onGuestStatusChange(lesson.id, option.action)
                }}
                className={cn(
                  'rounded px-0.5 py-1 text-[9px] font-medium leading-tight transition-colors',
                  isActive
                    ? option.action === 'trial'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-destructive text-destructive-foreground'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                  isLoading && 'opacity-50',
                  (canClearTrial || canClearCancelled) && 'hover:opacity-90',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      ) : compact ? (
        <p className="mt-0.5 text-[10px] font-medium text-primary/90">{statusLabel}</p>
      ) : null}

      {showActions && !inInstructorGroup && isInstructorUnassigned ? (
        <p
          className="mt-1 rounded border bg-muted/20 px-1 py-0.5 text-center text-[9px] font-medium text-muted-foreground"
          style={{ borderColor: AUTO_INSTRUCTOR_BORDER_COLOR }}
        >
          강사 미지정
        </p>
      ) : null}
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
        defaultEndTime={signatureDefaultEndTime}
        showEndTime
        showPastLessonFinder
        pastLessonMemberId={lesson.member_id ?? lesson.member?.id}
        onPastLessonUpdated={onLessonCompleted}
        onConfirm={(signatureData, endTime) =>
          handleCompleteLesson(signatureData, endTime)
        }
      />
    )}

    <AlertDialog
      open={cancelOpen}
      onOpenChange={(open) => {
        if (!isCancelling) setCancelOpen(open)
      }}
    >
      <AlertDialogContent mobileSheet>
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
  onClearAttendanceCheck: (lessonId: string) => void
  onGuestStatusChange: (lessonId: string, action: GuestLessonAction) => void
  onLessonCompleted: (lessonId: string, patch: Partial<Lesson>) => void
  onMemberLinked: (originalLessonId: string, lesson: Lesson, deletedIds?: string[]) => void
  onLessonEdited: (lesson: Lesson) => void
  onLessonDeleted: (lessonIds: string[]) => void
  bodyWeightByKey: Record<string, number>
  onBodyWeightChange: (memberId: string, date: string, weight: number | null) => void
  emptyMessage?: string
  autoScrollToNow?: boolean
}

function getMobileAthleteFlexClass(
  lessonId: string,
  expandedAthleteId: string | null,
  useScrollRow: boolean,
) {
  if (expandedAthleteId == null) {
    return useScrollRow
      ? 'min-w-[7.25rem] shrink-0 flex-[0_0_auto]'
      : 'min-w-0 flex-1 basis-0'
  }
  if (expandedAthleteId === lessonId) {
    return 'z-[1] min-w-[9.5rem] flex-[2.7] basis-0 shadow-md ring-1 ring-primary/30'
  }
  return useScrollRow
    ? 'min-w-[4.75rem] shrink-0 flex-[0_0_auto] opacity-85'
    : 'min-w-0 flex-[0.65] basis-0 opacity-85'
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
  onClearAttendanceCheck,
  onGuestStatusChange,
  onLessonCompleted,
  onMemberLinked,
  onLessonEdited,
  onLessonDeleted,
  emptyMessage = '등록된 수업이 없습니다.',
  autoScrollToNow = false,
}: TimeSlotsPanelProps) {
  const [expandedAthleteId, setExpandedAthleteId] = useState<string | null>(null)
  const timeSlots = useMemo(
    () => buildLessonStatusTimeSlots(lessons, instructors),
    [lessons, instructors],
  )
  const scrollTargetStart = useMemo(
    () => findLessonStatusScrollSlotStart(timeSlots),
    [timeSlots],
  )

  useEffect(() => {
    if (!autoScrollToNow || !scrollTargetStart) return
    const timer = window.setTimeout(() => {
      const el = document.querySelector(
        `[data-lesson-status-slot="${scrollTargetStart}"]`,
      ) as HTMLElement | null
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [autoScrollToNow, scrollTargetStart, lessons])

  function resolveInstructorColor(instructorId: string) {
    if (instructorId === AUTO_INSTRUCTOR_ID) return AUTO_INSTRUCTOR_BORDER_COLOR
    return getInstructorCalendarColor(instructorLookup.get(instructorId) ?? null)
  }

  if (lessons.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  const allLessonsInSlot = (slot: (typeof timeSlots)[number]) =>
    slot.rows.flatMap((rowChunks) =>
      rowChunks.flatMap((chunk) => chunk.lessons),
    )

  return (
    <>
      <div className="space-y-2 md:hidden">
        {timeSlots.map((slot) => {
          const slotLessons = allLessonsInSlot(slot)
          const useScrollRow = slotLessons.length >= 4

          return (
            <div
              key={slot.start || 'none'}
              data-lesson-status-slot={slot.start || 'none'}
              className="rounded-md border border-border bg-muted/20 p-3"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setExpandedAthleteId(null)
                }
              }}
            >
              <div className="mb-2 flex items-baseline gap-2">
                <p className="text-sm font-bold text-primary leading-none tabular-nums">
                  {formatStartTimeLabel(slot.start)}
                </p>
                <p className="text-xs text-muted-foreground">{slot.total}명</p>
              </div>

              <div
                className={cn(
                  'flex min-w-0 gap-2',
                  useScrollRow && 'overflow-x-auto overscroll-x-contain',
                )}
              >
                {slotLessons.map((lesson) => {
                  const expanded = expandedAthleteId === lesson.id
                  const color = resolveLessonInstructorColor(lesson, instructorLookup)
                  return (
                    <div
                      key={lesson.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={expanded}
                      className={cn(
                        'min-w-0 cursor-pointer overflow-hidden rounded-xl border-2 bg-card/60 transition-all duration-200 ease-out',
                        getMobileAthleteFlexClass(
                          lesson.id,
                          expandedAthleteId,
                          useScrollRow,
                        ),
                      )}
                      style={{ borderColor: color }}
                      onClick={(event) => {
                        const target = event.target as HTMLElement
                        if (
                          target.closest(
                            'button, a, input, textarea, select, label, [role="dialog"]',
                          )
                        ) {
                          return
                        }
                        setExpandedAthleteId((prev) =>
                          prev === lesson.id ? null : lesson.id,
                        )
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        setExpandedAthleteId((prev) =>
                          prev === lesson.id ? null : lesson.id,
                        )
                      }}
                    >
                      <AthleteTile
                        lesson={lesson}
                        compact={!expanded}
                        expanded={expanded}
                        isLoading={isUpdating === lesson.id}
                        canEditEndTime={canEditEndTime}
                        instructors={instructors}
                        instructorLookup={instructorLookup}
                        bodyWeightByKey={bodyWeightByKey}
                        onBodyWeightChange={onBodyWeightChange}
                        onStatusChange={onStatusChange}
                        onClearAttendanceCheck={onClearAttendanceCheck}
                        onGuestStatusChange={onGuestStatusChange}
                        onLessonCompleted={onLessonCompleted}
                        onMemberLinked={onMemberLinked}
                        onLessonEdited={onLessonEdited}
                        onLessonDeleted={onLessonDeleted}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="hidden space-y-1.5 md:block">
      {timeSlots.map((slot) =>
        slot.rows.map((rowChunks, rowIndex) => (
          <div
            key={`${slot.start || 'none'}-${rowIndex}`}
            data-lesson-status-slot={
              rowIndex === 0 ? slot.start || 'none' : undefined
            }
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
                        instructors={instructors}
                        instructorLookup={instructorLookup}
                        inInstructorGroup
                        bodyWeightByKey={bodyWeightByKey}
                        onBodyWeightChange={onBodyWeightChange}
                        onStatusChange={onStatusChange}
                        onClearAttendanceCheck={onClearAttendanceCheck}
                        onGuestStatusChange={onGuestStatusChange}
                        onLessonCompleted={onLessonCompleted}
                        onMemberLinked={onMemberLinked}
                        onLessonEdited={onLessonEdited}
                        onLessonDeleted={onLessonDeleted}
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
    </>
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentDate, setCurrentDate] = useState(selectedDate)
  const [viewMode, setViewMode] = useState<LessonStatusViewMode>(initialViewMode)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [lessons, setLessons] = useState(() =>
    sortLessonsForStatusDisplay(initialLessons, instructors),
  )
  const lessonHistory = useCalendarLessonHistory(setLessons)
  const clearHistoryRef = useRef(lessonHistory.clear)
  clearHistoryRef.current = lessonHistory.clear
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const [isLoadingDate, setIsLoadingDate] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
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

  const navKeyRef = useRef(`${selectedDate}|${initialViewMode}`)
  const viewBeforeListRef = useRef<LessonStatusGridViewMode>(
    initialViewMode === 'list' ? 'day' : initialViewMode,
  )

  useEffect(() => {
    const navKey = `${selectedDate}|${initialViewMode}`
    const navChanged = navKeyRef.current !== navKey
    navKeyRef.current = navKey

    setCurrentDate(selectedDate)
    setViewMode(initialViewMode)

    if (navChanged) {
      setLessons(sortLessonsForStatusDisplay(initialLessons, instructors))
      clearHistoryRef.current()
    }
  }, [selectedDate, initialViewMode, initialLessons, instructors])

  useEffect(() => {
    setBodyWeightByKey((prev) => ({
      ...initialBodyWeightByKey,
      ...prev,
    }))
  }, [initialBodyWeightByKey])

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
      present: lessons.filter((l) => {
        if (l.attendance_status === 'cancelled') return false
        if (!l.member_id) {
          if (isAthleticsClubLessonType(l.lesson_type)) {
            return isGroupLessonAttendanceMarked(l)
          }
          return l.lesson_type === '체험레슨'
        }
        return isLessonCountedAsMemberAttendance(l)
      }).length,
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

  const replaceLessonInPlace = useCallback(
    (originalId: string, resolvedId: string | undefined, patch: Partial<Lesson>) => {
      const activeId = resolvedId ?? originalId
      if (activeId !== originalId) {
        setLessons((prev) =>
          prev.map((lesson) =>
            lesson.id === originalId ? { ...lesson, ...patch, id: activeId } : lesson,
          ),
        )
      } else {
        updateLessonInPlace(originalId, patch)
      }
      return activeId
    },
    [updateLessonInPlace],
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
          const nextLessons = await getLessonsForStatusView({
            date: anchorDate,
          })
          setLessons(sortLessonsForStatusDisplay(nextLessons, instructors))
          return
        }
        const { dateFrom, dateTo } = getRangeForView(
          parseISO(anchorDate),
          getRangeViewForMode(mode),
        )
        const nextLessons = await getLessonsForStatusView({
          dateFrom,
          dateTo,
        })
        setLessons(sortLessonsForStatusDisplay(nextLessons, instructors))
      } catch {
        toast.error('수업 목록을 불러오지 못했습니다.')
      } finally {
        setIsLoadingDate(false)
        clearHistoryRef.current()
      }
    },
    [instructors],
  )

  useEffect(() => {
    if (searchParams.has('date')) return
    const localToday = format(new Date(), 'yyyy-MM-dd')
    syncUrl(localToday, initialViewMode)
    if (selectedDate === localToday) return
    setCurrentDate(localToday)
    void loadLessons(localToday, initialViewMode)
  }, [searchParams, selectedDate, initialViewMode, loadLessons, syncUrl])

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || isLoadingDate) return
    setIsRefreshing(true)
    try {
      await loadLessons(currentDate, viewMode)
      router.refresh()
      toast.success('새로고침 완료', {
        description: '앱 캘린더와 동일한 일정을 다시 불러왔습니다.',
      })
    } catch {
      toast.error('새로고침 실패', {
        description: '일정을 다시 불러오지 못했습니다.',
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [
    isRefreshing,
    isLoadingDate,
    loadLessons,
    currentDate,
    viewMode,
    router,
  ])

  const undoRef = useRef(lessonHistory.undo)
  undoRef.current = lessonHistory.undo
  const redoRef = useRef(lessonHistory.redo)
  redoRef.current = lessonHistory.redo

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return

      const undoRedo = matchCalendarUndoRedo(e)
      if (undoRedo === 'undo' && lessonHistory.canUndo && !e.repeat) {
        e.preventDefault()
        void undoRef.current()
        return
      }
      if (undoRedo === 'redo' && lessonHistory.canRedo && !e.repeat) {
        e.preventDefault()
        void redoRef.current()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lessonHistory.canUndo, lessonHistory.canRedo])

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
      if (mode !== 'list' && viewMode !== 'list') {
        viewBeforeListRef.current = mode
      }
      setViewMode(mode)
      setDatePickerOpen(false)
      syncUrl(currentDate, mode)
      await loadLessons(currentDate, mode)
    },
    [currentDate, loadLessons, syncUrl, viewMode],
  )

  const handleListToggle = useCallback(async () => {
    if (isLoadingDate || isRefreshing) return
    if (viewMode === 'list') {
      await handleViewModeChange(viewBeforeListRef.current)
      return
    }
    viewBeforeListRef.current = viewMode
    await handleViewModeChange('list')
  }, [viewMode, handleViewModeChange, isLoadingDate, isRefreshing])

  const handleStatusChange = useCallback(async (lessonId: string, status: AttendanceStatus) => {
    const before = lessons.find((lesson) => lesson.id === lessonId)
    if (!before) return

    const isAthleticsGroup =
      !before.member_id && isAthleticsClubLessonType(before.lesson_type)

    setIsUpdating(lessonId)
    const result = isAthleticsGroup
      ? await updateAthleticsClubAttendanceStatus(
          lessonId,
          status === 'cancelled' ? 'cancelled' : 'present',
        )
      : await updateLessonAttendanceStatus(lessonId, status)
    setIsUpdating(null)

    if (result.error) {
      toast.error('출석 처리 실패', { description: result.error })
      return
    }

    const checkedInAt =
      isAthleticsGroup && result.data && 'checked_in_at' in result.data
        ? result.data.checked_in_at ??
          parseGroupAttendanceCheckedInAt(
            'special_note' in result.data ? result.data.special_note : null,
          ) ??
          new Date().toISOString()
        : new Date().toISOString()

    const localPatch: Partial<Lesson> = {
      ...(result.data ?? {}),
      attendance_status: status,
      ...(isAthleticsGroup && result.data && 'special_note' in result.data
        ? { special_note: result.data.special_note }
        : {}),
      ...(status === 'present'
        ? { lesson_sessions: [{ checked_in_at: checkedInAt }] }
        : status === 'cancelled'
          ? { lesson_sessions: [] }
          : {}),
    }

    const activeId = replaceLessonInPlace(
      lessonId,
      result.data && 'lesson_id' in result.data ? result.data.lesson_id : undefined,
      localPatch,
    )

    const beforeSnap = structuredClone(before)
    lessonHistory.pushCommand({
      undo: async () => {
        if (isAthleticsGroup) {
          const undoResult = await updateLesson(beforeSnap.id, {
            attendance_status: beforeSnap.attendance_status,
            lesson_type: beforeSnap.lesson_type,
            special_note: beforeSnap.special_note ?? undefined,
          })
          if (undoResult.error) {
            toast.error('실행 취소 실패', { description: undoResult.error })
            return
          }
          updateLessonInPlace(activeId, {
            attendance_status: beforeSnap.attendance_status,
            lesson_type: beforeSnap.lesson_type,
            special_note: beforeSnap.special_note,
            lesson_sessions: beforeSnap.lesson_sessions ?? [],
          })
          return
        }

        const restore = await restoreLessonAttendanceSnapshot(beforeSnap)
        if (restore.error) {
          toast.error('실행 취소 실패', { description: restore.error })
          return
        }
        updateLessonInPlace(activeId, lessonAttendanceLocalPatch(beforeSnap))
      },
      redo: async () => {
        const redoResult = isAthleticsGroup
          ? await updateAthleticsClubAttendanceStatus(
              activeId,
              status === 'cancelled' ? 'cancelled' : 'present',
            )
          : await updateLessonAttendanceStatus(activeId, status)
        if (redoResult.error) {
          toast.error('다시 실행 실패', { description: redoResult.error })
          return
        }
        replaceLessonInPlace(
          activeId,
          redoResult.data && 'lesson_id' in redoResult.data
            ? redoResult.data.lesson_id
            : undefined,
          localPatch,
        )
      },
    })

    toast.message('출석 상태 변경', {
      description: '상단 실행 취소(↩)로 되돌릴 수 있습니다.',
    })
  }, [lessons, replaceLessonInPlace, updateLessonInPlace, lessonHistory])

  const handleClearAttendanceCheck = useCallback(
    async (lessonId: string) => {
      const before = lessons.find((lesson) => lesson.id === lessonId)
      if (!before) return

      const isAthleticsGroup =
        !before.member_id && isAthleticsClubLessonType(before.lesson_type)

      setIsUpdating(lessonId)
      const result = isAthleticsGroup
        ? await updateAthleticsClubAttendanceStatus(lessonId, 'unset')
        : await clearLessonAttendanceCheck(lessonId)
      setIsUpdating(null)

      if (result.error) {
        toast.error('출석 취소 실패', { description: result.error })
        return
      }

      const localPatch: Partial<Lesson> = isAthleticsGroup
        ? {
            attendance_status: 'present',
            special_note:
              result.data && 'special_note' in result.data
                ? result.data.special_note
                : null,
            lesson_sessions: [],
          }
        : {
            attendance_status: 'present',
            lesson_sessions: [],
            session_deducted: false,
          }

      const activeId = replaceLessonInPlace(
        lessonId,
        result.data && 'lesson_id' in result.data ? result.data.lesson_id : undefined,
        localPatch,
      )

      const beforeSnap = structuredClone(before)
      lessonHistory.pushCommand({
        undo: async () => {
          if (isAthleticsGroup) {
            const undoResult = await updateLesson(beforeSnap.id, {
              attendance_status: beforeSnap.attendance_status,
              lesson_type: beforeSnap.lesson_type,
              special_note: beforeSnap.special_note ?? undefined,
            })
            if (undoResult.error) {
              toast.error('실행 취소 실패', { description: undoResult.error })
              return
            }
            updateLessonInPlace(activeId, {
              attendance_status: beforeSnap.attendance_status,
              lesson_type: beforeSnap.lesson_type,
              special_note: beforeSnap.special_note,
              lesson_sessions: beforeSnap.lesson_sessions ?? [],
            })
            return
          }

          const restore = await restoreLessonAttendanceSnapshot(beforeSnap)
          if (restore.error) {
            toast.error('실행 취소 실패', { description: restore.error })
            return
          }
          updateLessonInPlace(activeId, lessonAttendanceLocalPatch(beforeSnap))
        },
        redo: async () => {
          const redoResult = isAthleticsGroup
            ? await updateAthleticsClubAttendanceStatus(activeId, 'unset')
            : await clearLessonAttendanceCheck(activeId)
          if (redoResult.error) {
            toast.error('다시 실행 실패', { description: redoResult.error })
            return
          }
          replaceLessonInPlace(
            activeId,
            redoResult.data && 'lesson_id' in redoResult.data
              ? redoResult.data.lesson_id
              : undefined,
            localPatch,
          )
        },
      })

      toast.message(
        before.attendance_status === 'cancelled' ? '수업 취소 해제' : '출석 체크 취소',
        {
          description: '상단 실행 취소(↩)로 되돌릴 수 있습니다.',
        },
      )
    },
    [lessons, replaceLessonInPlace, updateLessonInPlace, lessonHistory],
  )

  const handleGuestStatusChange = useCallback(async (lessonId: string, action: GuestLessonAction) => {
    const before = lessons.find((lesson) => lesson.id === lessonId)
    if (!before) return

    setIsUpdating(lessonId)
    const result = await markGuestLessonStatus(lessonId, action)
    setIsUpdating(null)

    if (result.error) {
      toast.error('처리 실패', { description: result.error })
      return
    }

    if (!result.data) return

    const localPatch: Partial<Lesson> = {
      lesson_type: result.data.lesson_type,
      attendance_status: result.data.attendance_status,
      ...(result.data && 'special_note' in result.data
        ? { special_note: result.data.special_note as string | null }
        : {}),
    }

    const activeId = replaceLessonInPlace(
      lessonId,
      result.data && 'lesson_id' in result.data ? result.data.lesson_id : undefined,
      localPatch,
    )

    const beforeSnap = structuredClone(before)
    lessonHistory.pushCommand({
      undo: async () => {
        const undoResult = await updateLesson(beforeSnap.id, {
          lesson_type: beforeSnap.lesson_type,
          attendance_status: beforeSnap.attendance_status,
        })
        if (undoResult.error) {
          toast.error('실행 취소 실패', { description: undoResult.error })
          return
        }
        updateLessonInPlace(activeId, {
          lesson_type: beforeSnap.lesson_type,
          attendance_status: beforeSnap.attendance_status,
          special_note: beforeSnap.special_note,
        })
      },
      redo: async () => {
        const redoResult = await markGuestLessonStatus(activeId, action)
        if (redoResult.error) {
          toast.error('다시 실행 실패', { description: redoResult.error })
          return
        }
        if (redoResult.data) {
          replaceLessonInPlace(
            activeId,
            redoResult.data.lesson_id,
            {
              lesson_type: redoResult.data.lesson_type,
              attendance_status: redoResult.data.attendance_status,
            },
          )
        }
      },
    })

    toast.message('미등록 수업 처리', {
      description: '상단 실행 취소(↩)로 되돌릴 수 있습니다.',
    })
  }, [lessons, replaceLessonInPlace, updateLessonInPlace, lessonHistory])

  const handleLessonCompleted = useCallback(
    (lessonId: string, patch: Partial<Lesson>) => {
      const resolvedId = patch.id
      if (resolvedId && resolvedId !== lessonId) {
        replaceLessonInPlace(lessonId, resolvedId, patch)
        return
      }
      updateLessonInPlace(lessonId, patch)
    },
    [replaceLessonInPlace, updateLessonInPlace],
  )

  const handleMemberLinked = useCallback(
    (originalId: string, linked: Lesson, deletedIds?: string[]) => {
      const removed = new Set(deletedIds ?? [])
      const linkedId = linked.id ?? originalId
      const seen = new Set<string>()
      setLessons((prev) =>
        sortLessonsForStatusDisplay(
          prev
            .filter(
              (lesson) =>
                !removed.has(lesson.id) &&
                !(lesson.id === linkedId && lesson.id !== originalId),
            )
            .map((lesson) =>
              lesson.id === originalId
                ? { ...lesson, ...linked, id: linkedId }
                : lesson,
            )
            .filter((lesson) => {
              if (seen.has(lesson.id)) return false
              seen.add(lesson.id)
              return true
            }),
          instructors,
        ),
      )
    },
    [instructors],
  )

  const handleLessonEdited = useCallback(
    (lesson: Lesson) => {
      setLessons((prev) =>
        sortLessonsForStatusDisplay(
          prev.map((item) => (item.id === lesson.id ? { ...item, ...lesson } : item)),
          instructors,
        ),
      )
    },
    [instructors],
  )

  const handleLessonDeleted = useCallback(
    (lessonIds: string[]) => {
      const removed = new Set(lessonIds)
      setLessons((prev) =>
        sortLessonsForStatusDisplay(
          prev.filter((item) => !removed.has(item.id)),
          instructors,
        ),
      )
    },
    [instructors],
  )

  const panelProps = {
    instructors,
    instructorLookup,
    isUpdating,
    canEditEndTime: isAdmin,
    bodyWeightByKey,
    onBodyWeightChange: handleBodyWeightChange,
    onStatusChange: handleStatusChange,
    onClearAttendanceCheck: handleClearAttendanceCheck,
    onGuestStatusChange: handleGuestStatusChange,
    onLessonCompleted: handleLessonCompleted,
    onMemberLinked: handleMemberLinked,
    onLessonEdited: handleLessonEdited,
    onLessonDeleted: handleLessonDeleted,
    autoScrollToNow: viewMode === 'day' && currentDate === today && !isLoadingDate,
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
                          instructors={instructors}
                          instructorLookup={instructorLookup}
                          bodyWeightByKey={bodyWeightByKey}
                          onBodyWeightChange={handleBodyWeightChange}
                          onStatusChange={handleStatusChange}
                          onClearAttendanceCheck={handleClearAttendanceCheck}
                          onGuestStatusChange={handleGuestStatusChange}
                          onLessonCompleted={updateLessonInPlace}
                          onMemberLinked={handleMemberLinked}
                          onLessonEdited={handleLessonEdited}
                          onLessonDeleted={handleLessonDeleted}
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
            disabled={isLoadingDate || isRefreshing}
            title={viewMode === 'list' ? '목록 닫기' : '목록 보기'}
            onClick={() => void handleListToggle()}
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
                disabled={isLoadingDate || isRefreshing}
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
                disabled={isLoadingDate || isRefreshing || isToday}
                onClick={() => void goToToday()}
              >
                오늘
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={isLoadingDate || isRefreshing}
                onClick={() => void navigatePeriod(1)}
                aria-label="다음"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={isLoadingDate || isRefreshing}
                onClick={() => void handleRefresh()}
                title="캘린더 일정 새로고침"
                aria-label="캘린더 일정 새로고침"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={!lessonHistory.canUndo || isLoadingDate || isRefreshing}
                onClick={() => void lessonHistory.undo()}
                title={
                  lessonHistory.canUndo
                    ? `실행 취소 (${lessonHistory.undoCount}단계 · Ctrl+Z)`
                    : '실행 취소'
                }
                aria-label={
                  lessonHistory.canUndo
                    ? `실행 취소 ${lessonHistory.undoCount}단계`
                    : '실행 취소'
                }
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={!lessonHistory.canRedo || isLoadingDate || isRefreshing}
                onClick={() => void lessonHistory.redo()}
                title={
                  lessonHistory.canRedo
                    ? `다시 실행 (${lessonHistory.redoCount}단계 · Ctrl+Y)`
                    : '다시 실행'
                }
                aria-label={
                  lessonHistory.canRedo
                    ? `다시 실행 ${lessonHistory.redoCount}단계`
                    : '다시 실행'
                }
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>

            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left text-sm font-semibold transition-colors hover:bg-muted"
                  disabled={isLoadingDate || isRefreshing}
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
          <Link href="/dashboard/calendar">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
              <CalendarDays className="h-3.5 w-3.5 mr-1" />
              캘린더
            </Button>
          </Link>
          <LessonQuickRegister
            lessonDate={currentDate}
            instructors={instructors}
            onCreated={handleQuickLessonCreated}
            panelContainerRef={quickRegisterPanelRef}
          />
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
          <TimeSlotsPanel key={currentDate} lessons={lessons} {...panelProps} />
        )
      ) : null}

      {viewMode === 'week' ? renderWeekOrMonthDays('week') : null}
      {viewMode === 'month' ? renderWeekOrMonthDays('month') : null}
      {viewMode === 'list' ? renderListView() : null}
    </div>
  )
}
