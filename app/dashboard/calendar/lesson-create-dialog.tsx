'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { Loader2, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  createLesson,
  createRecurringLessons,
  deleteLessonsInSeries,
  getLessonRecurrenceInfo,
  updateLesson,
  updateLessonSeries,
  removeLessonRecurrence,
  convertLessonToRecurringSeries,
  type LessonSeriesScope,
} from '@/lib/actions/lessons'
import { getRecurrenceDisplayLabel, isPersistedRecurringLesson } from '@/lib/calendar-recurrence/types'
import { resolveLessonRecurrence } from '@/lib/lesson-recurrence-legacy'
import {
  defaultRecurrenceEndDate,
  formatRecurrencePreview,
  isOpenEndedRecurrencePattern,
  LESSON_RECURRENCE_OPTIONS,
  parseLessonRecurrencePattern,
  resolveRecurrenceEndDate,
  type LessonRecurrencePattern,
} from '@/lib/lesson-recurrence'
import { AUTO_INSTRUCTOR_ID, normalizePrimaryInstructorId } from '@/lib/member-utils'
import {
  getLessonPopupPosition,
  getLessonCalendarLabel,
  getDefaultLessonCalendarLabel,
  resolveLessonTitle,
  isLessonScheduleEnded,
  resolveLessonDurationMinutes,
  shiftEndTimeByDuration,
  parseTimeToMinutes,
  type LessonDraft,
  type LessonEditAnchor,
} from '@/lib/calendar-utils'
import { parseSingleTimeToken, parseTimeRangeInput } from '@/lib/time-input-parse'
import {
  extractMemberNameFromCalendarLabel,
  formatMemberCalendarLabel,
} from '@/lib/member-utils'
import { touchMemberRecent } from '@/lib/member-recent-search'
import {
  LESSON_TYPE_OPTIONS,
  normalizeLessonType,
  isRunningLessonType,
} from '@/lib/lesson-types'
import {
  formatTrialLessonPayHint,
  isTrialLessonType,
} from '@/lib/trial-lesson-pay'
import { formatRunningLessonPayHint } from '@/lib/running-lesson-pay'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
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
import { Label } from '@/components/ui/label'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { SimpleTimeRangeInput } from '@/components/ui/simple-time-range-input'
import { InstructorSelectField } from '@/components/members/instructor-select-field'
import { MemberSearchSelect } from '@/components/members/member-search-select'
import { searchMembersForPicker } from '@/lib/actions/members'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isLessonEditFloatingUIOpen } from '@/lib/lesson-edit-floating-ui'
import { useTouchFriendlyLayout } from '@/hooks/use-touch-friendly-layout'
import type { Instructor, Lesson } from '@/lib/types'

interface MemberOption {
  id: string
  name: string
  sport?: string | null
  age?: number | null
  birth_date?: string | null
}

interface LessonCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft?: LessonDraft | null
  lesson?: Lesson | null
  members: MemberOption[]
  instructors: Instructor[]
  defaultInstructorId?: string | null
  onSaved: (lesson: Lesson) => void
  onDeleted?: (lessonIds: string[]) => void
  onEditDraftChange?: (draft: { instructorId: string }) => void
  variant?: 'dialog' | 'popup'
  anchor?: LessonEditAnchor | null
  sameSlotLessons?: Lesson[]
}

const LESSON_TYPES = [...LESSON_TYPE_OPTIONS]
const EMPTY_SLOT_LESSONS: Lesson[] = []

const POPUP_FIELD_LABEL =
  'text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground'
const POPUP_INPUT_VALUE =
  'h-7 border-0 bg-transparent px-0 text-xs font-semibold text-foreground shadow-none focus-visible:ring-0'
const POPUP_SECTION = 'space-y-1 rounded-md border border-border/55 bg-muted/10 px-2 py-1.5'

function PopupFormSection({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <div className={POPUP_SECTION}>
      <p className={POPUP_FIELD_LABEL}>{label}</p>
      {children}
      {hint ? (
        <div className="hidden text-[9px] leading-snug text-muted-foreground/90 sm:block">
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function LessonFormSection({
  label,
  htmlFor,
  isPopup,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  isPopup: boolean
  hint?: ReactNode
  children: ReactNode
}) {
  if (isPopup) {
    return (
      <PopupFormSection label={label} hint={hint}>
        {children}
      </PopupFormSection>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint}
    </div>
  )
}

function toTimeInputValue(value?: string | null) {
  if (!value) return ''
  return value.slice(0, 5)
}

function mergeMemberOptions(
  members: MemberOption[],
  lessons: Array<Lesson | null | undefined>,
): MemberOption[] {
  const map = new Map(members.map((m) => [m.id, m]))
  for (const item of lessons) {
    if (!item) continue
    if (item.member) {
      map.set(item.member.id, {
        id: item.member.id,
        name: item.member.name,
        sport: item.member.sport,
        age: item.member.age,
        birth_date: item.member.birth_date,
      })
      continue
    }
    if (item.member_id && !map.has(item.member_id)) {
      map.set(item.member_id, { id: item.member_id, name: '회원' })
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )
}

function getLessonMemberId(lesson: Lesson | null | undefined) {
  if (!lesson) return ''
  return lesson.member_id || lesson.member?.id || ''
}

export function LessonCreateDialog({
  open,
  onOpenChange,
  draft = null,
  lesson = null,
  members = [],
  instructors,
  defaultInstructorId = null,
  onSaved,
  onDeleted,
  onEditDraftChange,
  variant = 'dialog',
  anchor = null,
  sameSlotLessons = EMPTY_SLOT_LESSONS,
}: LessonCreateDialogProps) {
  const isEditing = Boolean(lesson)
  const isPopup = variant === 'popup'
  const touchFriendly = useTouchFriendlyLayout()
  const useAnchoredPopup = isPopup && !touchFriendly
  const isCompactForm = isPopup && !touchFriendly
  const popupRef = useRef<HTMLDivElement>(null)
  const initKeyRef = useRef<string | null>(null)
  const originalLessonDateRef = useRef('')
  const pendingEditUpdatesRef = useRef<{
    instructor_id: string | undefined
    lesson_date: string
    start_time: string | undefined
    end_time: string | undefined
    lesson_type: string
    member_id: string | null
    title: string | null
  } | null>(null)
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number; width: number }>({
    top: 80,
    left: 304,
    width: 272,
  })
  const [mounted, setMounted] = useState(false)
  const initialInstructorId = defaultInstructorId || AUTO_INSTRUCTOR_ID
  const [memberId, setMemberId] = useState('')
  const [entryText, setEntryText] = useState('')
  const [calendarDisplayText, setCalendarDisplayText] = useState('')
  const [instructorId, setInstructorId] = useState(initialInstructorId)
  const [lessonType, setLessonType] = useState('개인레슨')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [date, setDate] = useState('')
  const [isAddingToSlot, setIsAddingToSlot] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [recurrencePattern, setRecurrencePattern] =
    useState<LessonRecurrencePattern>('none')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [seriesGroupId, setSeriesGroupId] = useState<string | null>(null)
  const [saveScopeOpen, setSaveScopeOpen] = useState(false)
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false)
  const recurrenceUserEditedRef = useRef(false)
  const editDurationMinutesRef = useRef<number | null>(null)

  const shouldPreserveEditDuration = useCallback(() => {
    if (!lesson) return false
    const referenceEnd = endTime || lesson.end_time
    return !isLessonScheduleEnded(date || lesson.lesson_date, referenceEnd)
  }, [lesson, date, endTime])

  const handleStartTimeChange = useCallback(
    (value: string) => {
      setStartTime(value)

      if (!shouldPreserveEditDuration() || editDurationMinutesRef.current == null) {
        return
      }

      const range = parseTimeRangeInput(value)
      if (range?.end) {
        setEndTime(range.end)
        const duration =
          parseTimeToMinutes(range.end) - parseTimeToMinutes(range.start)
        if (duration >= 15) {
          editDurationMinutesRef.current = duration
        }
        return
      }

      const normalized = parseSingleTimeToken(value)
      if (!normalized) return

      const shiftedEnd = shiftEndTimeByDuration(
        normalized,
        editDurationMinutesRef.current,
      )
      if (shiftedEnd) {
        setEndTime(shiftedEnd)
      }
    },
    [shouldPreserveEditDuration],
  )

  const handleEndTimeChange = useCallback(
    (value: string) => {
      setEndTime(value)

      if (!lesson || isLessonScheduleEnded(date || lesson.lesson_date, value)) {
        return
      }

      const startNorm = parseSingleTimeToken(startTime)
      const endNorm = parseSingleTimeToken(value)
      if (!startNorm || !endNorm) return

      const duration = parseTimeToMinutes(endNorm) - parseTimeToMinutes(startNorm)
      if (duration >= 15) {
        editDurationMinutesRef.current = duration
      }
    },
    [lesson, date, startTime],
  )

  function getActiveSeriesGroupId(targetLesson?: typeof lesson) {
    return seriesGroupId ?? resolveLessonRecurrence(targetLesson ?? lesson ?? {}).groupId
  }

  const memberOptions = useMemo(
    () => mergeMemberOptions(members, [lesson, ...sameSlotLessons]),
    [members, lesson, sameSlotLessons],
  )

  const slotAssignedMemberIds = useMemo(() => {
    const ids = new Set<string>()
    if (lesson) {
      const primaryId = getLessonMemberId(lesson)
      if (primaryId) ids.add(primaryId)
    }
    for (const item of sameSlotLessons) {
      const id = getLessonMemberId(item)
      if (id) ids.add(id)
    }
    return ids
  }, [lesson, sameSlotLessons])

  const calendarPlaceholder = useMemo(() => {
    if (lesson?.member) return getDefaultLessonCalendarLabel(lesson.member)
    if (memberId) {
      const member = memberOptions.find((m) => m.id === memberId)
      if (member) return formatMemberCalendarLabel(member)
    }
    return entryText.trim() || '이름(39축구)'
  }, [lesson?.member, memberId, memberOptions, entryText])

  const selectedMemberId = memberId

  const addModeDisabledMemberIds = useMemo(() => {
    if (!isAddingToSlot) return []
    return Array.from(slotAssignedMemberIds)
  }, [isAddingToSlot, slotAssignedMemberIds])

  const recurrencePreview = useMemo(() => {
    if (recurrencePattern === 'none') return null
    return formatRecurrencePreview(date, recurrencePattern, recurrenceEndDate, {
      editing: isEditing && !isAddingToSlot,
    })
  }, [recurrencePattern, recurrenceEndDate, date, isEditing, isAddingToSlot])

  const fixedLessonPayHint =
    isTrialLessonType(lessonType) && date
      ? formatTrialLessonPayHint(date)
      : isRunningLessonType(lessonType)
        ? formatRunningLessonPayHint()
        : null

  const linkedMemberId = memberId || getLessonMemberId(lesson)
  const linkedMemberLabel = useMemo(() => {
    if (lesson) return getLessonCalendarLabel(lesson)
    if (memberId) {
      const member = memberOptions.find((item) => item.id === memberId)
      if (member) return formatMemberCalendarLabel(member)
    }
    const trimmed = entryText.trim()
    return trimmed || null
  }, [lesson, memberId, memberOptions, entryText])

  const popupTitle = (
    <>
      <span className="font-medium text-muted-foreground">
        {isAddingToSlot ? '수업 추가' : '수업 수정'}
      </span>
      {!isAddingToSlot && linkedMemberLabel ? (
        <>
          <span className="text-muted-foreground/70"> · </span>
          {linkedMemberId ? (
            <Link
              href={`/dashboard/members/${linkedMemberId}`}
              className="font-semibold text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {linkedMemberLabel}
            </Link>
          ) : (
            <span className="font-semibold text-primary">{linkedMemberLabel}</span>
          )}
        </>
      ) : null}
    </>
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!open || !useAnchoredPopup) return

    const base = anchor
      ? getLessonPopupPosition(anchor)
      : {
          top: 80,
          left: Math.max(12, (window.innerWidth - 272) / 2),
          width: Math.min(272, window.innerWidth - 24),
        }

    const el = popupRef.current
    if (!el) {
      setPopupPosition(base)
      return
    }

    let top = base.top
    const height = el.offsetHeight
    if (top + height > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - height - 12)
    }
    setPopupPosition({ top, left: base.left, width: base.width })
  }, [
    open,
    useAnchoredPopup,
    anchor,
    isAddingToSlot,
    lesson?.id,
    date,
    startTime,
    endTime,
    memberId,
    recurrencePattern,
    recurrenceEndDate,
  ])

  useEffect(() => {
    if (!open) {
      initKeyRef.current = null
      return
    }

    const initKey = lesson
      ? `${lesson.id}:${sameSlotLessons.map((l) => l.id).join(',')}`
      : draft
        ? `${draft.date}:${draft.startTime}:${draft.endTime}`
        : 'create'

    if (initKeyRef.current === initKey) return
    initKeyRef.current = initKey
    recurrenceUserEditedRef.current = false

    if (lesson) {
      const primaryMemberId = getLessonMemberId(lesson)
      setMemberId(primaryMemberId)
      if (lesson.member) {
        setEntryText(
          lesson.member.name ||
            memberOptions.find((m) => m.id === primaryMemberId)?.name ||
            '',
        )
      } else {
        setEntryText(resolveLessonTitle(lesson) || '')
      }
      setInstructorId(lesson.instructor_id || initialInstructorId)
      setLessonType(normalizeLessonType(lesson.lesson_type))
      setDate(lesson.lesson_date)
      setStartTime(toTimeInputValue(lesson.start_time))
      setEndTime(toTimeInputValue(lesson.end_time))
      editDurationMinutesRef.current = resolveLessonDurationMinutes(
        lesson.start_time,
        lesson.end_time,
      )
      const customTitle = resolveLessonTitle(lesson)
      setCalendarDisplayText(
        customTitle ??
          (lesson.member ? formatMemberCalendarLabel(lesson.member) : ''),
      )
      originalLessonDateRef.current = lesson.lesson_date
      const recurrence = resolveLessonRecurrence(lesson)
      setSeriesGroupId(recurrence.groupId)
      setRecurrencePattern(recurrence.pattern)
      setRecurrenceEndDate(
        defaultRecurrenceEndDate(lesson.lesson_date, recurrence.pattern),
      )
      void getLessonRecurrenceInfo(lesson.id).then((info) => {
        if (!info || initKeyRef.current !== initKey) return
        setSeriesGroupId(info.groupId)
        if (!recurrenceUserEditedRef.current) {
          setRecurrencePattern(info.pattern)
        }
        if (
          info.endDate &&
          !isOpenEndedRecurrencePattern(info.pattern) &&
          !recurrenceUserEditedRef.current
        ) {
          setRecurrenceEndDate(info.endDate)
        }
      })
      return
    }

    if (draft) {
      setMemberId('')
      setEntryText('')
      setCalendarDisplayText('')
      setInstructorId(initialInstructorId)
      setLessonType('개인레슨')
      setDate(draft.date)
      setStartTime(draft.startTime)
      setEndTime('')
      editDurationMinutesRef.current = null
      setRecurrencePattern('none')
      setRecurrenceEndDate(defaultRecurrenceEndDate(draft.date))
    }
  }, [open, lesson, draft, sameSlotLessons, initialInstructorId])

  useEffect(() => {
    if (!open || recurrencePattern === 'none') return
    if (!date) return
    if (isOpenEndedRecurrencePattern(recurrencePattern)) {
      if (recurrenceEndDate) setRecurrenceEndDate('')
      return
    }
    if (!recurrenceEndDate || recurrenceEndDate < date) {
      setRecurrenceEndDate(defaultRecurrenceEndDate(date, recurrencePattern))
    }
  }, [open, recurrencePattern, date, recurrenceEndDate])

  useEffect(() => {
    if (!open || !isEditing || !onEditDraftChange) return
    onEditDraftChange({ instructorId })
  }, [open, isEditing, instructorId, onEditDraftChange])

  useEffect(() => {
    if (!open || !useAnchoredPopup) return

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element
      if (popupRef.current?.contains(target)) return
      if (target.closest('[data-lesson-edit-popup]')) return
      if (target.closest('[data-radix-popper-content-wrapper]')) return
      if (target.closest('[data-slot="popover-content"]')) return
      if (target.closest('[data-slot="select-content"]')) return
      if (target.closest('[role="listbox"]')) return
      if (target.closest('[role="dialog"], [role="alertdialog"]')) return
      if (saveScopeOpen || deleteScopeOpen) return
      // capture 단계에서 검사 — Radix가 Select를 닫기 전에 열림 상태를 확인
      if (isLessonEditFloatingUIOpen()) return
      handleOpenChange(false)
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [open, useAnchoredPopup, saveScopeOpen, deleteScopeOpen])

  function handleMemberChange(
    nextMemberId: string,
    picked?: MemberOption,
  ) {
    setMemberId(nextMemberId)
    if (!nextMemberId) return

    const member =
      picked ??
      memberOptions.find((m) => m.id === nextMemberId) ??
      (lesson?.member?.id === nextMemberId ? lesson.member : undefined) ??
      sameSlotLessons.find((l) => getLessonMemberId(l) === nextMemberId)?.member

    if (member) {
      setCalendarDisplayText(formatMemberCalendarLabel(member))
      setEntryText(member.name)
      touchMemberRecent({ id: member.id, name: member.name })
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      initKeyRef.current = null
      setMemberId('')
      setEntryText('')
      setCalendarDisplayText('')
      setInstructorId(initialInstructorId)
      setLessonType('개인레슨')
      setStartTime('')
      setEndTime('')
      setDate('')
      setIsAddingToSlot(false)
      setRecurrencePattern('none')
      setRecurrenceEndDate('')
      setSaveScopeOpen(false)
      setDeleteScopeOpen(false)
      setIsLoading(false)
      setIsDeleting(false)
      pendingEditUpdatesRef.current = null
    }
    onOpenChange(next)
  }

  function validateRecurrenceSelection() {
    if (recurrencePattern === 'none') return true
    if (isOpenEndedRecurrencePattern(recurrencePattern)) return true
    if (!recurrenceEndDate) {
      toast.error('반복 종료 날짜를 선택해주세요.')
      return false
    }
    if (recurrenceEndDate < date) {
      toast.error('반복 종료 날짜는 시작 날짜 이후여야 합니다.')
      return false
    }
    return true
  }

  function validateLessonIdentityForRecurrence() {
    const resolvedMemberId = memberId || getLessonMemberId(lesson)
    const resolvedTitle =
      calendarDisplayText.trim() || entryText.trim() || resolveLessonTitle(lesson)
    if (!resolvedMemberId && !resolvedTitle) {
      toast.error('반복 등록 전 회원을 선택하거나 이름을 입력해주세요.')
      return false
    }
    return true
  }

  function getResolvedRecurrenceEndDate() {
    return resolveRecurrenceEndDate(date, recurrencePattern, recurrenceEndDate)
  }

  async function saveNewLessons(
    schedulePayload: {
      instructor_id: string | undefined
      lesson_date: string
      start_time: string | undefined
      end_time: string | undefined
      lesson_type: string
    },
    identityPayload: {
      member_id: string | null
      title: string | null
    },
    successLabel: string,
  ) {
    if (recurrencePattern !== 'none') {
      if (!validateLessonIdentityForRecurrence()) {
        setIsLoading(false)
        return
      }
      if (!validateRecurrenceSelection()) {
        setIsLoading(false)
        return
      }

      const result = await createRecurringLessons(
        {
          ...schedulePayload,
          ...identityPayload,
        },
        {
          pattern: recurrencePattern,
          endDate: getResolvedRecurrenceEndDate(),
          recurrencePattern,
        },
      )

      if (result.error) {
        setIsLoading(false)
        toast.error('반복 수업 등록 실패', { description: result.error })
        return
      }

      result.data?.forEach((item) => onSaved(item))
      showSaveWarning(result.warning)

      setIsLoading(false)
      const created = result.createdCount ?? 0
      const linked = result.linkedCount ?? 0
      if (linked > 0 && created > 0) {
        toast.success(`${created}개 등록, ${linked}개 기존 일정 연결`)
      } else if (linked > 0) {
        toast.success(`${linked}개 기존 일정을 반복 시리즈에 연결했습니다.`)
      } else if (result.data?.length) {
        toast.success(
          `${getRecurrenceDisplayLabel(recurrencePattern) ?? '반복'} 일정이 등록되었습니다.`,
        )
      } else {
        toast.success(successLabel)
      }
      handleOpenChange(false)
      return
    }

    const result = await createLesson({
      ...schedulePayload,
      ...identityPayload,
    })

    if (result.error) {
      setIsLoading(false)
      toast.error('수업 등록 실패', { description: result.error })
      return
    }

    if (result.data) onSaved(result.data)
    showSaveWarning(result.warning)

    setIsLoading(false)
    toast.success(successLabel)
    handleOpenChange(false)
  }

  function handleAddAnotherMember() {
    if (!lesson) return
    setIsAddingToSlot(true)
    setMemberId('')
    setEntryText('')
    setCalendarDisplayText('')
    setInstructorId(lesson.instructor_id || initialInstructorId)
    setRecurrencePattern('none')
    setRecurrenceEndDate(defaultRecurrenceEndDate(lesson.lesson_date))
  }

  async function handleDeleteRequest() {
    if (!isEditing || !lesson || isDeleting || isLoading) return

    const hasSeries =
      Boolean(seriesGroupId) || recurrencePattern !== 'none'

    if (hasSeries) {
      setDeleteScopeOpen(true)
      return
    }

    const name = getLessonCalendarLabel(lesson)
    if (!window.confirm(`${name} 수업을 삭제할까요?`)) return
    void executeDelete('single')
  }

  async function executeDelete(scope: LessonSeriesScope) {
    if (!lesson) return

    setDeleteScopeOpen(false)
    setIsDeleting(true)

    try {
      const result = await deleteLessonsInSeries(
        lesson.id,
        scope,
        date || originalLessonDateRef.current || lesson.lesson_date,
      )

      if (result.error) {
        if (result.error.includes('찾을 수 없습니다')) {
          onDeleted?.([lesson.id])
          toast.info('이미 삭제되었거나 목록에 없는 수업입니다.', {
            description: '캘린더에서 제거했습니다.',
          })
          handleOpenChange(false)
          return
        }
        toast.error('수업 삭제 실패', { description: result.error })
        return
      }

      const deletedIds = result.deletedIds ?? []
      if (deletedIds.length === 0) {
        if (scope === 'future') {
          onDeleted?.([lesson.id])
          toast.success('이후 반복 일정이 삭제되었습니다.')
          handleOpenChange(false)
          return
        }
        toast.error('수업 삭제 실패', {
          description:
            '삭제된 수업이 없습니다. Supabase에서 supabase/fix-lessons-recurrence-delete.sql 을 실행했는지 확인하거나, 새로고침 후 다시 시도해주세요.',
        })
        return
      }

      onDeleted?.(deletedIds)
      toast.success(
        deletedIds.length > 1
          ? `${deletedIds.length}개 수업이 삭제되었습니다.`
          : '수업이 삭제되었습니다.',
      )
      handleOpenChange(false)
    } catch (error) {
      console.error('executeDelete:', error)
      toast.error('수업 삭제 실패', {
        description: '서버 요청 중 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  async function executeEditSave(
    scope: LessonSeriesScope,
    updates: {
      instructor_id: string | undefined
      lesson_date: string
      start_time: string | undefined
      end_time: string | undefined
      lesson_type: string
      member_id: string | null
      title: string | null
    },
  ) {
    if (!lesson) return

    const persistedRecurrence = isPersistedRecurringLesson(lesson)
    const hasRecurringContext =
      persistedRecurrence || Boolean(getActiveSeriesGroupId())

    setIsLoading(true)
    setSaveScopeOpen(false)

    const anchorDate =
      updates.lesson_date ||
      originalLessonDateRef.current ||
      lesson.lesson_date

    if (recurrencePattern === 'none' && hasRecurringContext) {
      const result = await removeLessonRecurrence(lesson.id, scope, anchorDate, updates)

      if (result.error) {
        setIsLoading(false)
        toast.error('반복 해제 실패', { description: result.error })
        return
      }

      const deletedIds = new Set(result.deletedIds ?? [])
      deletedIds.add(lesson.id)
      onDeleted?.([...deletedIds])
      result.data?.forEach((item) => onSaved(item))

      setIsLoading(false)
      toast.success('반복이 해제되었습니다.')
      handleOpenChange(false)
      return
    }

    if (recurrencePattern !== 'none' && !persistedRecurrence) {
      if (!validateLessonIdentityForRecurrence()) {
        setIsLoading(false)
        return
      }
      if (!validateRecurrenceSelection()) {
        setIsLoading(false)
        return
      }

      const result = await convertLessonToRecurringSeries(
        lesson.id,
        scope,
        anchorDate,
        updates,
        recurrencePattern,
        isOpenEndedRecurrencePattern(recurrencePattern)
          ? null
          : resolveRecurrenceEndDate(date, recurrencePattern, recurrenceEndDate),
      )

      if (result.error) {
        setIsLoading(false)
        toast.error('반복 일정 등록 실패', { description: result.error })
        return
      }

      if (result.deletedIds?.length) {
        onDeleted?.(result.deletedIds)
      }
      result.data?.forEach((item) => onSaved(item))

      setIsLoading(false)
      toast.success(
        `${getRecurrenceDisplayLabel(recurrencePattern) ?? '반복'} 일정으로 등록되었습니다.`,
      )
      handleOpenChange(false)
      return
    }

    if (recurrencePattern === 'none') {
      const result = await updateLesson(lesson.id, {
        ...updates,
        recurrence_pattern: 'none',
        recurrence_group_id: null,
      })

      if (result.error) {
        setIsLoading(false)
        toast.error('수업 수정 실패', { description: result.error })
        return
      }

      if (result.data) onSaved(result.data)
      showSaveWarning(result.warning)
      setIsLoading(false)
      toast.success('수업이 수정되었습니다.')
      handleOpenChange(false)
      return
    }

    const result = await updateLessonSeries(lesson.id, updates, scope, anchorDate)

    if (result.error) {
      setIsLoading(false)
      toast.error('수업 수정 실패', { description: result.error })
      return
    }

    if (result.deletedIds?.length) {
      onDeleted?.(result.deletedIds)
    }
    result.data?.forEach((item) => onSaved(item))
    showSaveWarning(result.warning)

    setIsLoading(false)

    if ((result.data?.length ?? 0) > 1) {
      toast.success(`${result.data?.length ?? 0}개 수업이 수정되었습니다.`)
    } else {
      toast.success('수업이 수정되었습니다.')
    }

    handleOpenChange(false)
  }

  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (deleteScopeOpen) {
          setDeleteScopeOpen(false)
          return
        }
        handleOpenChange(false)
        return
      }

      if (e.key !== 'Delete' || !isEditing || !lesson || isAddingToSlot) return

      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        target.closest('[role="combobox"]') ||
        target.closest('[role="listbox"]')
      ) {
        return
      }
      e.preventDefault()
      void handleDeleteRequest()
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [open, isEditing, lesson?.id, isAddingToSlot, deleteScopeOpen])

  function showSaveWarning(warning?: string) {
    if (warning) {
      toast.warning('DB 마이그레이션 필요', { description: warning })
    }
  }

  async function resolveSubmitMemberId(
    initialMemberId: string,
    calendarText: string,
    nameText: string,
  ): Promise<string | null> {
    if (initialMemberId) return initialMemberId

    const candidateName = extractMemberNameFromCalendarLabel(
      calendarText || nameText,
    )
    if (!candidateName) return null

    const localMatches = memberOptions.filter((m) => m.name === candidateName)
    if (localMatches.length === 1) return localMatches[0].id

    const remoteMatches = await searchMembersForPicker(candidateName)
    const exactRemote = remoteMatches.filter((m) => m.name === candidateName)
    if (exactRemote.length === 1) return exactRemote[0].id

    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedCalendar = calendarDisplayText.trim()
    if (!date) {
      toast.error('날짜를 선택해주세요.')
      return
    }

    setIsLoading(true)

    const submitMemberId = await resolveSubmitMemberId(
      memberId,
      trimmedCalendar,
      entryText.trim(),
    )

    const resolvedMember =
      memberOptions.find((m) => m.id === submitMemberId) ??
      lesson?.member ??
      null
    const autoLabel = submitMemberId
      ? formatMemberCalendarLabel(resolvedMember)
      : entryText.trim()
    const submitTitle = trimmedCalendar
      ? trimmedCalendar === autoLabel && submitMemberId
        ? null
        : trimmedCalendar
      : submitMemberId
        ? null
        : entryText.trim() || null
    if (!submitMemberId && !submitTitle) {
      setIsLoading(false)
      toast.error('이름을 입력해주세요.')
      return
    }

    if (
      !isEditing &&
      !isAddingToSlot &&
      submitMemberId &&
      sameSlotLessons.some((item) => getLessonMemberId(item) === submitMemberId)
    ) {
      setIsLoading(false)
      toast.error('이미 같은 시간에 배정된 회원입니다.')
      return
    }

    const schedulePayload: Partial<LessonFormData> = {
      lesson_date: date,
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      lesson_type: lessonType,
    }
    Object.assign(schedulePayload, {
      instructor_id: normalizePrimaryInstructorId(instructorId),
    })

    const identityPayload = {
      member_id: submitMemberId,
      title: submitTitle,
    }

    if (isAddingToSlot && lesson) {
      if (submitMemberId && slotAssignedMemberIds.has(submitMemberId)) {
        setIsLoading(false)
        toast.error('이미 같은 시간에 배정된 회원입니다.')
        return
      }

      await saveNewLessons(schedulePayload, identityPayload, '수업이 추가되었습니다.')
      return
    }

    if (isEditing && lesson) {
      const updates = {
        ...schedulePayload,
        ...identityPayload,
      }

      if (recurrencePattern !== 'none' && !validateRecurrenceSelection()) {
        setIsLoading(false)
        return
      }

      const hasRecurringContext =
        isPersistedRecurringLesson(lesson) || Boolean(getActiveSeriesGroupId())

      if (hasRecurringContext && recurrencePattern === 'none') {
        await executeEditSave('all', updates)
        return
      }

      if (hasRecurringContext) {
        pendingEditUpdatesRef.current = updates
        setIsLoading(false)
        setSaveScopeOpen(true)
        return
      }

      if (recurrencePattern !== 'none') {
        setIsLoading(false)
        await executeEditSave('all', updates)
        return
      }

      const primaryResult = await updateLesson(lesson.id, updates)

      if (primaryResult.error) {
        setIsLoading(false)
        toast.error('수업 수정 실패', { description: primaryResult.error })
        return
      }

      if (primaryResult.data) onSaved(primaryResult.data)
      showSaveWarning(primaryResult.warning)

      setIsLoading(false)
      toast.success('수업이 수정되었습니다.')
      handleOpenChange(false)
      return
    }

    await saveNewLessons(schedulePayload, identityPayload, '수업이 등록되었습니다.')
  }

  const formFields = (
    <>
      <LessonFormSection label="날짜" htmlFor="lesson-date" isPopup={isCompactForm}>
        <KoreanDatePicker
          id="lesson-date"
          value={date}
          onChange={setDate}
          placeholder="날짜 선택"
          compact={isCompactForm}
          className={isCompactForm ? POPUP_INPUT_VALUE : undefined}
        />
      </LessonFormSection>

      <LessonFormSection label="시작 / 종료" isPopup={isCompactForm}>
        {isCompactForm ? (
          <div className="grid grid-cols-2 gap-2">
            <SimpleTimeRangeInput
              startId="start-time"
              endId="end-time"
              startValue={startTime}
              endValue={endTime}
              onStartChange={handleStartTimeChange}
              onEndChange={handleEndTimeChange}
              calendarStartTime={draft?.startTime ?? null}
              endPlaceholder={draft?.endTime || '19:30'}
              compact={isCompactForm}
              className="col-span-2 [&_input]:h-7 [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-0 [&_input]:text-xs [&_input]:font-semibold [&_input]:shadow-none [&_input]:focus-visible:ring-0"
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Label htmlFor="start-time">시작</Label>
              <Label htmlFor="end-time">종료</Label>
            </div>
            <SimpleTimeRangeInput
              startId="start-time"
              endId="end-time"
              startValue={startTime}
              endValue={endTime}
              onStartChange={handleStartTimeChange}
              onEndChange={handleEndTimeChange}
              calendarStartTime={draft?.startTime ?? null}
              endPlaceholder={draft?.endTime || '19:30'}
              compact={isCompactForm}
            />
            <p className="text-xs text-muted-foreground">
              예: 18:00~19:30 (시작 칸에 한 번에 입력 가능)
            </p>
          </>
        )}
      </LessonFormSection>

      <LessonFormSection label="회원 연결" isPopup={isCompactForm}>
        <MemberSearchSelect
          key={
            isAddingToSlot
              ? `add-${lesson?.id}`
              : isEditing
                ? `edit-${lesson?.id}`
                : 'create'
          }
          value={selectedMemberId}
          onValueChange={handleMemberChange}
          inputValue={entryText}
          onInputValueChange={setEntryText}
          members={memberOptions}
          placeholder="이름 입력 또는 검색"
          disabledIds={addModeDisabledMemberIds}
          compact={isCompactForm}
          allowFreeText
          inlineSearch
          enableRecentSearches
          onSearchMembers={searchMembersForPicker}
          className={
            isCompactForm
              ? '[&_input]:h-7 [&_input]:border-0 [&_input]:bg-transparent [&_input]:pl-7 [&_input]:text-xs [&_input]:font-semibold [&_input]:shadow-none [&_input]:focus-visible:ring-0'
              : undefined
          }
        />
      </LessonFormSection>

      <LessonFormSection
        label="캘린더 표시"
        htmlFor="calendar-display"
        isPopup={isCompactForm}
        hint={
          isCompactForm ? null : (
            <p className="text-[11px] text-muted-foreground">
              비우면 회원 정보로 자동 표시 · 예: {calendarPlaceholder}
            </p>
          )
        }
      >
        <Input
          id="calendar-display"
          value={calendarDisplayText}
          onChange={(e) => setCalendarDisplayText(e.target.value)}
          placeholder={calendarPlaceholder}
          className={isCompactForm ? POPUP_INPUT_VALUE : undefined}
        />
      </LessonFormSection>

      {isCompactForm ? (
        <div className="grid grid-cols-2 gap-1.5">
          <div className={POPUP_SECTION}>
            <InstructorSelectField
              id="lesson-instructor"
              label="강사"
              value={instructorId}
              onChange={setInstructorId}
              instructors={instructors}
              compact
              labelClassName={POPUP_FIELD_LABEL}
              triggerClassName="h-7 border-0 bg-transparent px-0 text-xs font-semibold shadow-none"
            />
          </div>
          <div className={POPUP_SECTION}>
            <p className={POPUP_FIELD_LABEL}>수업 유형</p>
            <Select value={lessonType} onValueChange={setLessonType}>
              <SelectTrigger className="h-7 border-0 bg-transparent px-0 text-xs font-semibold shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LESSON_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <>
          <InstructorSelectField
            id="lesson-instructor"
            label="강사"
            value={instructorId}
            onChange={setInstructorId}
            instructors={instructors}
          />
          <div className="space-y-1.5">
            <Label>수업 유형</Label>
            <Select value={lessonType} onValueChange={setLessonType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LESSON_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {fixedLessonPayHint ? (
        <p className="text-[11px] font-medium text-primary">{fixedLessonPayHint}</p>
      ) : null}

      <div
        className={cn(
          'space-y-1',
          isCompactForm ? POPUP_SECTION : 'rounded-md border border-border/70 bg-muted/20 p-2',
        )}
      >
        <div className="space-y-0.5">
          <Label className={isCompactForm ? POPUP_FIELD_LABEL : undefined}>반복</Label>
          <Select
            value={recurrencePattern}
            onValueChange={(value) => {
              const next = value as LessonRecurrencePattern
              recurrenceUserEditedRef.current = true
              setRecurrencePattern(next)
              setRecurrenceEndDate(defaultRecurrenceEndDate(date, next))
            }}
          >
            <SelectTrigger
              className={
                isCompactForm
                  ? 'h-7 border-0 bg-transparent px-0 text-xs font-semibold shadow-none'
                  : undefined
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LESSON_RECURRENCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {recurrencePattern !== 'none' ? (
          <div className="space-y-1">
            {isOpenEndedRecurrencePattern(recurrencePattern) ? (
              <p className="text-[11px] text-muted-foreground">
                삭제할 때까지 같은 시간·강사로 계속 반복됩니다.
              </p>
            ) : (
              <>
                <Label
                  htmlFor="recurrence-end-date"
                  className={isCompactForm ? POPUP_FIELD_LABEL : undefined}
                >
                  반복 종료
                </Label>
                <KoreanDatePicker
                  id="recurrence-end-date"
                  value={recurrenceEndDate}
                  onChange={setRecurrenceEndDate}
                  placeholder="종료 날짜"
                  compact={isCompactForm}
                  className={isCompactForm ? POPUP_INPUT_VALUE : undefined}
                />
              </>
            )}
            {recurrencePreview ? (
              <p className="text-[11px] font-medium text-primary">
                {recurrencePreview}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {isEditing && !isAddingToSlot
                  ? '이 수업을 수정한 뒤 이후 일정을 추가합니다.'
                  : '같은 시간·강사로 반복 등록됩니다.'}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </>
  )

  const popupFooter = (
    <div className="flex items-center gap-1.5">
      {isEditing && !isAddingToSlot && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8"
          disabled={isLoading || isDeleting}
          title="삭제 (Del)"
          onClick={() => void handleDeleteRequest()}
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 flex-1 text-xs sm:h-8"
        disabled={isDeleting}
        onClick={() => handleOpenChange(false)}
      >
        취소
      </Button>
      <Button
        type="submit"
        size="sm"
        className="h-7 flex-1 text-xs sm:h-8"
        disabled={isLoading || isDeleting}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            {isAddingToSlot ? '등록 중...' : '저장 중...'}
          </>
        ) : isAddingToSlot ? (
          '등록'
        ) : (
          '저장'
        )}
      </Button>
    </div>
  )

  const dialogFooter = (
    <DialogFooter>
      <div className="flex w-full items-center gap-2">
        {isEditing && !isAddingToSlot && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isLoading || isDeleting}
            title="삭제 (Del)"
            onClick={() => void handleDeleteRequest()}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isDeleting}
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button type="submit" disabled={isLoading || isDeleting}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isEditing ? '저장 중...' : '등록 중...'}
              </>
            ) : isEditing ? (
              '저장'
            ) : (
              '등록'
            )}
          </Button>
        </div>
      </div>
    </DialogFooter>
  )

  const form = (
    <form
      onSubmit={handleSubmit}
      className={cn('space-y-3', isCompactForm && 'text-sm')}
    >
      {formFields}
      {!useAnchoredPopup && dialogFooter}
    </form>
  )

  const editLabel = lesson ? getLessonCalendarLabel(lesson) : '수업'

  const scopeDialogs = (
    <>
      <AlertDialog
        open={saveScopeOpen}
        onOpenChange={(next) => {
          if (!isLoading) setSaveScopeOpen(next)
        }}
      >
        <AlertDialogContent mobileSheet>
          <AlertDialogHeader>
            <AlertDialogTitle>수업 수정 범위</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{editLabel}</span>{' '}
              {recurrencePattern === 'none'
                ? '반복 일정입니다. 반복을 해제할 범위를 선택하세요.'
                : '반복 일정입니다. 어떻게 수정할까요? 이전 날짜는 변경되지 않습니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isLoading || !pendingEditUpdatesRef.current}
              onClick={() => {
                if (!pendingEditUpdatesRef.current) return
                void executeEditSave('single', pendingEditUpdatesRef.current)
              }}
            >
              {recurrencePattern === 'none' ? '이 날만 단일 수업으로' : '이것만 수정'}
            </Button>
            {recurrencePattern !== 'none' ? (
              <Button
                type="button"
                className="w-full"
                disabled={isLoading || !pendingEditUpdatesRef.current}
                onClick={() => {
                  if (!pendingEditUpdatesRef.current) return
                  void executeEditSave('all', pendingEditUpdatesRef.current)
                }}
              >
                전체 수정
              </Button>
            ) : null}
            <Button
              type="button"
              className="w-full"
              disabled={isLoading || !pendingEditUpdatesRef.current}
              onClick={() => {
                if (!pendingEditUpdatesRef.current) return
                void executeEditSave(
                  recurrencePattern === 'none' ? 'all' : 'future',
                  pendingEditUpdatesRef.current,
                )
              }}
            >
              {recurrencePattern === 'none' ? '전체 반복 해제' : '이후 모두 수정'}
            </Button>
            <AlertDialogCancel disabled={isLoading} className="w-full">
              취소
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteScopeOpen}
        onOpenChange={(next) => {
          if (!isDeleting) setDeleteScopeOpen(next)
        }}
      >
        <AlertDialogContent mobileSheet>
          <AlertDialogHeader>
            <AlertDialogTitle>수업 삭제 범위</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">{editLabel}</span>{' '}
                  반복 일정입니다. 어떻게 삭제할까요?
                </p>
                <p className="text-[11px]">
                  전체·이후 삭제는 이 회원의 같은 요일·같은 시작 시간 일정만 대상입니다.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={isDeleting}
              onClick={() => void executeDelete('all')}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  삭제 중...
                </>
              ) : (
                '반복 전체 지우기'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isDeleting}
              onClick={() => void executeDelete('single')}
            >
              이것만 지우기
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isDeleting}
              onClick={() => void executeDelete('future')}
            >
              이후 모두 지우기
            </Button>
            <AlertDialogCancel disabled={isDeleting} className="w-full">
              취소
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  if (useAnchoredPopup) {
    if (!open || !mounted) return null

    return createPortal(
      <>
      <div
        ref={popupRef}
        data-lesson-edit-popup
        className="fixed z-50 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-card shadow-xl animate-in fade-in-0 zoom-in-95"
        style={{
          top: popupPosition.top,
          left: popupPosition.left,
          width: popupPosition.width,
        }}
        onPointerDownCapture={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-1.5 border-b border-border bg-muted/15 px-2.5 py-2">
          <div className="min-w-0">
            <h3 className="truncate text-xs leading-snug sm:text-sm">{popupTitle}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {!isAddingToSlot && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-1.5 text-[10px] sm:h-7 sm:px-2 sm:text-xs"
                onClick={handleAddAnotherMember}
              >
                <UserPlus className="mr-0.5 h-3 w-3 sm:mr-1 sm:h-3.5 sm:w-3.5" />
                추가
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 sm:h-7 sm:w-7"
              onClick={() => handleOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="text-xs sm:text-sm">
          <div className="max-h-[min(70vh,32rem)] space-y-1.5 overflow-y-auto overscroll-contain px-2.5 py-1.5">
            {formFields}
          </div>
          <div className="border-t border-border px-2.5 py-1.5">{popupFooter}</div>
        </form>
      </div>
      {scopeDialogs}
      </>,
      document.body,
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          mobileSheet
          onInteractOutside={(event) => {
            if (isLessonEditFloatingUIOpen()) {
              event.preventDefault()
            }
          }}
          className={cn(
            'sm:max-w-md',
            touchFriendly &&
              'max-lg:flex max-lg:max-h-[inherit] max-lg:flex-col max-lg:gap-0 max-lg:overflow-hidden max-lg:p-0',
          )}
        >
          <DialogHeader
            className={cn(
              touchFriendly && 'shrink-0 border-b border-border px-4 py-3 text-left',
            )}
          >
            <DialogTitle className="flex flex-wrap items-baseline gap-x-1 text-base leading-snug">
              {isEditing ? (
                popupTitle
              ) : (
                <span className="font-semibold text-foreground">수업 추가</span>
              )}
            </DialogTitle>
            {!touchFriendly ? (
              <DialogDescription>
                {isEditing
                  ? '수업 일정과 정보를 수정합니다.'
                  : '드래그한 시간에 새 수업을 등록합니다.'}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {touchFriendly ? (
            <form
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                <div className={cn('space-y-3', isCompactForm && 'text-sm')}>
                  {formFields}
                </div>
              </div>
              <div className="shrink-0 border-t border-border px-4 py-3">
                {dialogFooter}
              </div>
            </form>
          ) : (
            form
          )}
        </DialogContent>
      </Dialog>
      {scopeDialogs}
    </>
  )
}
