'use client'

import Link from 'next/link'
import { memo, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { markAttendance } from '@/lib/actions/lessons'
import {
  cancelLessonCompletion,
  clearLessonAttendanceCheck,
} from '@/lib/actions/lesson-sessions'
import { isAttendanceMarked } from '@/lib/lesson-record-utils'
import { toast } from 'sonner'
import { Lesson, AttendanceStatus } from '@/types/database'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  buildLessonStatusTimeSlots,
  getLessonCalendarDisplayParts,
  LESSON_STATUS_MAX_PER_ROW,
} from '@/lib/calendar-utils'
import { AUTO_INSTRUCTOR_ID } from '@/lib/member-utils'
import {
  AUTO_INSTRUCTOR_BORDER_COLOR,
  getInstructorCalendarColor,
  resolveLessonDisplayColor,
} from '@/lib/instructor-colors'
import { cn } from '@/lib/utils'
import type { Instructor } from '@/lib/types'
import {
  CalendarX,
  CheckCircle2,
  Clock,
  Filter,
  ListChecks,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'

interface LessonWithRelations extends Lesson {
  member?: { id: string; name: string; phone: string | null; sport: string | null } | null
  instructor?: { id: string; name: string; calendar_color?: string | null } | null
}

type AttendanceInstructor = Pick<
  Instructor,
  'id' | 'name' | 'calendar_color' | 'is_active'
>

interface AttendanceCheckProps {
  initialLessons: LessonWithRelations[]
  instructors: AttendanceInstructor[]
}

const ATTENDANCE_OPTIONS: {
  value: AttendanceStatus
  label: string
  activeClass: string
}[] = [
  { value: 'present', label: '출석', activeClass: 'bg-primary text-primary-foreground' },
  { value: 'absent', label: '결석', activeClass: 'bg-destructive text-destructive-foreground' },
  { value: 'makeup', label: '보강', activeClass: 'bg-yellow-500 text-black' },
  { value: 'cancelled', label: '취소', activeClass: 'bg-muted text-muted-foreground' },
]

function formatStartTimeLabel(start: string) {
  return start || '시간 미정'
}

function formatTime(value: string | null | undefined) {
  if (!value) return null
  return value.slice(0, 5)
}

interface AttendanceTileProps {
  lesson: LessonWithRelations
  isLoading: boolean
  isCancelling: boolean
  instructorLookup: Map<string, AttendanceInstructor>
  inInstructorGroup?: boolean
  onStatusChange: (lessonId: string, status: AttendanceStatus) => void
  onClearPresentCheck: (lessonId: string) => void
  onAttendanceCancelled: (
    lessonId: string,
    update: {
      end_time: null
      session_deducted: boolean
      signature_id: null
    },
  ) => void
  onCancelStart: (lessonId: string) => void
  onCancelEnd: () => void
}

function resolveLessonInstructorColor(
  lesson: LessonWithRelations,
  instructorLookup: Map<string, AttendanceInstructor>,
) {
  return resolveLessonDisplayColor(lesson, [...instructorLookup.values()])
}

const AttendanceTile = memo(function AttendanceTile({
  lesson,
  isLoading,
  isCancelling,
  instructorLookup,
  inInstructorGroup = false,
  onStatusChange,
  onClearPresentCheck,
  onAttendanceCancelled,
  onCancelStart,
  onCancelEnd,
}: AttendanceTileProps) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const display = getLessonCalendarDisplayParts(lesson)
  const label = display.meta ? `${display.name}(${display.meta})` : display.name
  const isMemberLinked = Boolean(lesson.member_id)
  const completed = Boolean(lesson.session_deducted && lesson.end_time)
  const instructorBorderColor = resolveLessonInstructorColor(lesson, instructorLookup)

  async function handleCancelAttendance() {
    onCancelStart(lesson.id)
    const result = await cancelLessonCompletion(lesson.id)
    onCancelEnd()

    if (result.error) {
      toast.error('출석 체크 취소 실패', { description: result.error })
      return
    }

    if (result.data) {
      onAttendanceCancelled(lesson.id, {
        end_time: null,
        session_deducted: result.data.session_deducted,
        signature_id: null,
      })
      toast.success(`${label} 출석 체크 취소`, {
        description: '종료·서명이 취소되었고 세션 차감이 복구되었습니다.',
      })
    }

    setCancelOpen(false)
  }

  return (
    <>
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-md bg-card/60 p-1.5',
        inInstructorGroup
          ? 'border-0'
          : cn('border', isMemberLinked ? 'border-2' : 'border-border'),
      )}
      style={
        !inInstructorGroup ? { borderColor: instructorBorderColor } : undefined
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

      <div
        className="mt-1 grid grid-cols-2 gap-0.5"
        role="group"
        aria-label={`${label} 출석 상태`}
      >
        {ATTENDANCE_OPTIONS.map((option) => {
          const isPresentMarked =
            lesson.attendance_status === 'present' && isAttendanceMarked(lesson)
          const isActive =
            option.value === 'present'
              ? isPresentMarked
              : lesson.attendance_status === option.value
          const canClearPresent =
            option.value === 'present' && isPresentMarked && !completed
          const canCancelByRetap = completed && isActive
          return (
            <button
              key={option.value}
              type="button"
              disabled={isLoading || isCancelling || (completed && !isActive)}
              title={
                canCancelByRetap
                  ? '출석 체크 취소'
                  : canClearPresent
                    ? '출석 취소'
                    : option.label
              }
              onClick={() => {
                if (canCancelByRetap) {
                  setCancelOpen(true)
                  return
                }
                if (canClearPresent) {
                  onClearPresentCheck(lesson.id)
                  return
                }
                onStatusChange(lesson.id, option.value)
              }}
              className={cn(
                'rounded px-0.5 py-1 text-[9px] font-medium leading-tight transition-colors',
                isActive
                  ? option.activeClass
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                (isLoading || isCancelling || (completed && !isActive)) && 'opacity-50',
                canCancelByRetap && 'hover:opacity-90',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {(completed || lesson.signature_id) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-[9px]">
          {completed && (
            <button
              type="button"
              disabled={isLoading || isCancelling}
              title="출석 체크 취소"
              onClick={() => setCancelOpen(true)}
              className={cn(
                'inline-flex items-center gap-0.5 rounded border border-primary/30 bg-primary/5 px-1 py-0.5 font-medium text-primary transition-colors hover:bg-primary/15',
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
          )}
          {lesson.signature_id && (
            <span className="text-muted-foreground">서명완료</span>
          )}
        </div>
      )}
    </div>

    <AlertDialog
      open={cancelOpen}
      onOpenChange={(open) => {
        if (!isCancelling) setCancelOpen(open)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>출석 체크 취소</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{label}</span> 출석 체크를
            취소하시겠습니까?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCancelling}>아니요</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={isCancelling}
            onClick={() => void handleCancelAttendance()}
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

export function AttendanceCheck({ initialLessons, instructors }: AttendanceCheckProps) {
  const router = useRouter()
  const [lessons, setLessons] = useState(initialLessons)
  const [instructorFilter, setInstructorFilter] = useState<string>('all')
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState<string | null>(null)

  const instructorLookup = useMemo(
    () => new Map(instructors.map((instructor) => [instructor.id, instructor])),
    [instructors],
  )

  const filteredLessons = useMemo(
    () =>
      lessons.filter(
        (lesson) =>
          instructorFilter === 'all' || lesson.instructor_id === instructorFilter,
      ),
    [lessons, instructorFilter],
  )

  const stats = useMemo(
    () => ({
      total: filteredLessons.length,
      present: filteredLessons.filter(
        (l) => l.attendance_status === 'present' && isAttendanceMarked(l),
      ).length,
      absent: filteredLessons.filter((l) => l.attendance_status === 'absent').length,
      makeup: filteredLessons.filter((l) => l.attendance_status === 'makeup').length,
      cancelled: filteredLessons.filter((l) => l.attendance_status === 'cancelled').length,
    }),
    [filteredLessons],
  )

  const timeSlots = useMemo(
    () => buildLessonStatusTimeSlots(filteredLessons, instructors),
    [filteredLessons, instructors],
  )

  function resolveInstructorColor(instructorId: string) {
    if (instructorId === AUTO_INSTRUCTOR_ID) return AUTO_INSTRUCTOR_BORDER_COLOR
    return getInstructorCalendarColor(instructorLookup.get(instructorId) ?? null)
  }

  async function handleStatusChange(lessonId: string, newStatus: AttendanceStatus) {
    setIsUpdating(lessonId)

    const result = await markAttendance(lessonId, newStatus)

    if (result.error) {
      toast.error('출석 처리 실패', { description: result.error })
    } else if (result.data) {
      setLessons((prev) =>
        prev.map((lesson) =>
          lesson.id === lessonId
            ? {
                ...lesson,
                ...result.data,
                attendance_status: newStatus,
                ...(newStatus === 'present'
                  ? { lesson_sessions: [{ checked_in_at: new Date().toISOString() }] }
                  : {}),
              }
            : lesson,
        ),
      )
    }

    setIsUpdating(null)
  }

  async function handleClearPresentCheck(lessonId: string) {
    setIsUpdating(lessonId)
    const result = await clearLessonAttendanceCheck(lessonId)
    setIsUpdating(null)

    if (result.error) {
      toast.error('출석 취소 실패', { description: result.error })
      return
    }

    setLessons((prev) =>
      prev.map((lesson) =>
        lesson.id === lessonId
          ? {
              ...lesson,
              attendance_status: 'present',
              lesson_sessions: [],
              session_deducted: false,
            }
          : lesson,
      ),
    )
  }

  function handleAttendanceCancelled(
    lessonId: string,
    update: {
      end_time: null
      session_deducted: boolean
      signature_id: null
    },
  ) {
    setLessons((prev) =>
      prev.map((lesson) =>
        lesson.id === lessonId ? { ...lesson, ...update } : lesson,
      ),
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          <span>
            전체 <strong className="text-foreground">{stats.total}</strong>
          </span>
          <span className="text-border">|</span>
          <span>
            출석 <strong className="text-green-400">{stats.present}</strong>
          </span>
          <span className="text-border">|</span>
          <span>
            결석 <strong className="text-red-400">{stats.absent}</strong>
          </span>
          <span className="text-border">|</span>
          <span>
            보강 <strong className="text-yellow-400">{stats.makeup}</strong>
          </span>
          <span className="text-border">|</span>
          <span>
            취소 <strong className="text-muted-foreground">{stats.cancelled}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={instructorFilter} onValueChange={setInstructorFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="강사 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 강사</SelectItem>
              {instructors.map((instructor) => (
                <SelectItem key={instructor.id} value={instructor.id}>
                  {instructor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.refresh()}
            aria-label="새로고침"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {filteredLessons.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          <ListChecks className="mx-auto mb-2 h-6 w-6 opacity-40" />
          <p>오늘 예정된 수업이 없습니다.</p>
        </div>
      ) : (
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
                          <AttendanceTile
                            key={lesson.id}
                            lesson={lesson as LessonWithRelations}
                            isLoading={isUpdating === lesson.id}
                            isCancelling={isCancelling === lesson.id}
                            instructorLookup={instructorLookup}
                            inInstructorGroup
                            onStatusChange={handleStatusChange}
                            onClearPresentCheck={handleClearPresentCheck}
                            onAttendanceCancelled={handleAttendanceCancelled}
                            onCancelStart={setIsCancelling}
                            onCancelEnd={() => setIsCancelling(null)}
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
      )}

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-primary" />
          출석
        </span>
        <span className="inline-flex items-center gap-1">
          <XCircle className="h-3 w-3 text-destructive" />
          결석
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3 text-yellow-400" />
          보강
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarX className="h-3 w-3" />
          취소
        </span>
        {(isUpdating || isCancelling) && (
          <span className="inline-flex items-center gap-1 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            {isCancelling ? '취소 중...' : '저장 중...'}
          </span>
        )}
      </div>
    </div>
  )
}
