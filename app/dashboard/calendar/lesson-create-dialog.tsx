'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  type LessonSeriesScope,
} from '@/lib/actions/lessons'
import { resolveLessonRecurrence } from '@/lib/lesson-recurrence-legacy'
import {
  defaultRecurrenceEndDate,
  formatRecurrencePreview,
  getAdditionalRecurrenceDates,
  LESSON_RECURRENCE_OPTIONS,
  parseLessonRecurrencePattern,
  type LessonRecurrencePattern,
} from '@/lib/lesson-recurrence'
import { AUTO_INSTRUCTOR_ID, normalizePrimaryInstructorId } from '@/lib/member-utils'
import { getLessonPopupPosition, getLessonCalendarLabel, getDefaultLessonCalendarLabel, resolveLessonTitle, type LessonDraft, type LessonEditAnchor } from '@/lib/calendar-utils'
import {
  extractMemberNameFromCalendarLabel,
  formatMemberCalendarLabel,
} from '@/lib/member-utils'
import { touchMemberRecent } from '@/lib/member-recent-search'
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
import { cn } from '@/lib/utils'
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

const LESSON_TYPES = ['개인레슨', '그룹레슨', '체험레슨', '보강']
const EMPTY_SLOT_LESSONS: Lesson[] = []

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
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number }>({
    top: 80,
    left: 304,
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
  const [recurrencePattern, setRecurrencePattern] =
    useState<LessonRecurrencePattern>('none')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [seriesGroupId, setSeriesGroupId] = useState<string | null>(null)
  const [saveScopeOpen, setSaveScopeOpen] = useState(false)
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false)

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

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!open || !isPopup) return

    const base = anchor
      ? getLessonPopupPosition(anchor)
      : { top: 80, left: Math.max(16, window.innerWidth - 304) }

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
    setPopupPosition({ top, left: base.left })
  }, [
    open,
    isPopup,
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
      setLessonType(lesson.lesson_type || '개인레슨')
      setDate(lesson.lesson_date)
      setStartTime(toTimeInputValue(lesson.start_time))
      setEndTime(toTimeInputValue(lesson.end_time))
      const customTitle = resolveLessonTitle(lesson)
      setCalendarDisplayText(
        customTitle ??
          (lesson.member ? formatMemberCalendarLabel(lesson.member) : ''),
      )
      originalLessonDateRef.current = lesson.lesson_date
      const recurrence = resolveLessonRecurrence(lesson)
      setSeriesGroupId(recurrence.groupId)
      setRecurrencePattern(recurrence.pattern)
      setRecurrenceEndDate(defaultRecurrenceEndDate(lesson.lesson_date))
      void getLessonRecurrenceInfo(lesson.id).then((info) => {
        if (!info || initKeyRef.current !== initKey) return
        setSeriesGroupId(info.groupId)
        setRecurrencePattern(info.pattern)
        if (info.endDate) setRecurrenceEndDate(info.endDate)
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
      setRecurrencePattern('none')
      setRecurrenceEndDate(defaultRecurrenceEndDate(draft.date))
    }
  }, [open, lesson, draft, sameSlotLessons, initialInstructorId])

  useEffect(() => {
    if (!open || recurrencePattern === 'none') return
    if (!date) return
    if (!recurrenceEndDate || recurrenceEndDate < date) {
      setRecurrenceEndDate(defaultRecurrenceEndDate(date))
    }
  }, [open, recurrencePattern, date, recurrenceEndDate])

  useEffect(() => {
    if (!open || !isEditing || !onEditDraftChange) return
    onEditDraftChange({ instructorId })
  }, [open, isEditing, instructorId, onEditDraftChange])

  useEffect(() => {
    if (!open || !isPopup) return

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (popupRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-radix-popper-content-wrapper]')) return
      if ((target as Element).closest?.('[data-slot="popover-content"]')) return
      if ((target as Element).closest?.('[role="listbox"]')) return
      handleOpenChange(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open, isPopup])

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
      pendingEditUpdatesRef.current = null
    }
    onOpenChange(next)
  }

  function validateRecurrenceSelection() {
    if (recurrencePattern === 'none') return true
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
          endDate: recurrenceEndDate,
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
      toast.success(
        `${result.createdCount ?? result.data?.length ?? 0}개 ${successLabel}`,
      )
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
    if (!isEditing || !lesson) return

    setIsLoading(true)
    const info = await getLessonRecurrenceInfo(lesson.id)
    setIsLoading(false)

    if (info?.groupId) setSeriesGroupId(info.groupId)
    if (info?.pattern && info.pattern !== 'none') {
      setRecurrencePattern(info.pattern)
    }
    if (info?.endDate) setRecurrenceEndDate(info.endDate)

    const hasSeries =
      Boolean(info?.groupId) ||
      (info?.pattern !== undefined && info.pattern !== 'none')

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
    setIsLoading(true)

    try {
      const result = await deleteLessonsInSeries(
        lesson.id,
        scope,
        originalLessonDateRef.current || lesson.lesson_date,
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
        toast.error('수업 삭제 실패', {
          description:
            '삭제된 수업이 없습니다. Supabase에서 supabase/fix-lessons-recurrence-delete.sql 을 실행했는지 확인해주세요.',
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
      setIsLoading(false)
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

    const activeSeriesGroupId = getActiveSeriesGroupId()
    const hadRecurrenceGroup = Boolean(activeSeriesGroupId)

    setIsLoading(true)
    setSaveScopeOpen(false)

    const anchorDate = originalLessonDateRef.current || lesson.lesson_date
    const result = await updateLessonSeries(lesson.id, updates, scope, anchorDate)

    if (result.error) {
      setIsLoading(false)
      toast.error('수업 수정 실패', { description: result.error })
      return
    }

    result.data?.forEach((item) => onSaved(item))
    showSaveWarning(result.warning)

    let createdCount = 0

    if (recurrencePattern !== 'none' && !hadRecurrenceGroup) {
      if (!validateRecurrenceSelection()) {
        setIsLoading(false)
        return
      }

      const additionalDates = getAdditionalRecurrenceDates(
        date,
        recurrencePattern,
        recurrenceEndDate,
      )

      if (additionalDates.length > 0) {
        const updatedPrimary =
          result.data?.find((item) => item.id === lesson.id) ?? result.data?.[0]
        let groupId =
          scope === 'future'
            ? activeSeriesGroupId ?? updatedPrimary?.recurrence_group_id
            : updatedPrimary?.recurrence_group_id

        if (!groupId) {
          groupId = crypto.randomUUID()
          const linkResult = await updateLesson(lesson.id, {
            recurrence_group_id: groupId,
            recurrence_pattern: recurrencePattern,
          })
          if (linkResult.data) onSaved(linkResult.data)
        } else if (scope === 'future') {
          const linkResult = await updateLesson(lesson.id, {
            recurrence_pattern: recurrencePattern,
          })
          if (linkResult.data) onSaved(linkResult.data)
        }

        const recurringResult = await createRecurringLessons(
          {
            instructor_id: updates.instructor_id,
            lesson_date: date,
            start_time: updates.start_time,
            end_time: updates.end_time,
            lesson_type: updates.lesson_type,
            member_id: updates.member_id,
            title: updates.title,
          },
          {
            dates: additionalDates,
            recurrenceGroupId: groupId!,
            recurrencePattern,
          },
        )

        if (recurringResult.error) {
          setIsLoading(false)
          toast.error('반복 수업 추가 실패', {
            description: recurringResult.error,
          })
          return
        }

        recurringResult.data?.forEach((item) => onSaved(item))
        showSaveWarning(recurringResult.warning)
        createdCount = recurringResult.createdCount ?? additionalDates.length
      }
    }

    setIsLoading(false)

    if (createdCount > 0) {
      toast.success(`수업이 수정되었고 ${createdCount}개 일정이 추가되었습니다.`)
    } else if ((result.data?.length ?? 0) > 1) {
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

    const schedulePayload = {
      instructor_id: normalizePrimaryInstructorId(instructorId) || undefined,
      lesson_date: date,
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      lesson_type: lessonType,
    }

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

      if (getActiveSeriesGroupId()) {
        pendingEditUpdatesRef.current = updates
        setIsLoading(false)
        setSaveScopeOpen(true)
        return
      }

      if (recurrencePattern !== 'none') {
        setIsLoading(false)
        await executeEditSave('single', updates)
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
      <div className="space-y-1.5">
        <Label htmlFor="lesson-date" className={isPopup ? 'text-xs' : undefined}>
          날짜
        </Label>
        <KoreanDatePicker
          id="lesson-date"
          value={date}
          onChange={setDate}
          placeholder="날짜 선택"
          compact={isPopup}
          className={isPopup ? 'text-xs' : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          <Label htmlFor="start-time" className={isPopup ? 'text-xs' : undefined}>
            시작
          </Label>
          <Label htmlFor="end-time" className={isPopup ? 'text-xs' : undefined}>
            종료
          </Label>
        </div>
        <SimpleTimeRangeInput
          startId="start-time"
          endId="end-time"
          startValue={startTime}
          endValue={endTime}
          onStartChange={setStartTime}
          onEndChange={setEndTime}
          calendarStartTime={draft?.startTime ?? null}
          endPlaceholder={draft?.endTime || '19:30'}
          compact={isPopup}
        />
        {!isPopup && (
          <p className="text-xs text-muted-foreground">
            예: 18:00~19:30 (시작 칸에 한 번에 입력 가능)
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className={isPopup ? 'text-xs' : undefined}>회원 연결 (선택)</Label>
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
          compact={isPopup}
          allowFreeText
          inlineSearch
          enableRecentSearches
          onSearchMembers={searchMembersForPicker}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="calendar-display" className={isPopup ? 'text-xs' : undefined}>
          캘린더 표시
        </Label>
        <Input
          id="calendar-display"
          value={calendarDisplayText}
          onChange={(e) => setCalendarDisplayText(e.target.value)}
          placeholder={calendarPlaceholder}
          className={isPopup ? 'h-8 text-xs' : undefined}
        />
        <p className="text-[11px] text-muted-foreground">
          비우면 회원 정보로 자동 표시 · 예: {calendarPlaceholder}
        </p>
      </div>

      {isPopup ? (
        <div className="grid grid-cols-2 gap-2">
          <InstructorSelectField
            id="lesson-instructor"
            label="강사"
            value={instructorId}
            onChange={setInstructorId}
            instructors={instructors}
            compact
          />
          <div className="space-y-1">
            <Label className="text-xs">수업 유형</Label>
            <Select value={lessonType} onValueChange={setLessonType}>
              <SelectTrigger className="h-8 text-xs">
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

      <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/20 p-2">
        <div className="space-y-1">
          <Label className={isPopup ? 'text-xs' : undefined}>반복</Label>
          <Select
            value={recurrencePattern}
            onValueChange={(value) =>
              setRecurrencePattern(value as LessonRecurrencePattern)
            }
          >
            <SelectTrigger className={isPopup ? 'h-8 text-xs' : undefined}>
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
            <Label
              htmlFor="recurrence-end-date"
              className={isPopup ? 'text-xs' : undefined}
            >
              반복 종료
            </Label>
            <KoreanDatePicker
              id="recurrence-end-date"
              value={recurrenceEndDate}
              onChange={setRecurrenceEndDate}
              placeholder="종료 날짜"
              compact={isPopup}
              className={isPopup ? 'text-xs' : undefined}
            />
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
    <div className="flex items-center gap-2">
      {isEditing && !isAddingToSlot && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isLoading}
          title="삭제 (Del)"
          onClick={() => void handleDeleteRequest()}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() => handleOpenChange(false)}
      >
        취소
      </Button>
      <Button type="submit" size="sm" className="flex-1" disabled={isLoading}>
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
            disabled={isLoading}
            title="삭제 (Del)"
            onClick={() => void handleDeleteRequest()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button type="submit" disabled={isLoading}>
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
      className={cn('space-y-3', isPopup && 'text-sm')}
    >
      {formFields}
      {!isPopup && dialogFooter}
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수업 수정 범위</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{editLabel}</span>{' '}
              반복 일정입니다. 어떻게 수정할까요? 이전 날짜는 변경되지 않습니다.
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
              이것만 수정
            </Button>
            <Button
              type="button"
              className="w-full"
              disabled={isLoading || !pendingEditUpdatesRef.current}
              onClick={() => {
                if (!pendingEditUpdatesRef.current) return
                void executeEditSave('future', pendingEditUpdatesRef.current)
              }}
            >
              이후 모두 수정
            </Button>
            <AlertDialogCancel disabled={isLoading} className="w-full">
              취소
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {deleteScopeOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-scope-title"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget && !isLoading) {
              setDeleteScopeOpen(false)
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-2xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h3 id="delete-scope-title" className="text-base font-semibold">
              수업 삭제 범위
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{editLabel}</span>{' '}
              반복 일정입니다. 어떻게 삭제할까요?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={isLoading}
                onClick={() => void executeDelete('all')}
              >
                반복 전체 지우기
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading}
                onClick={() => void executeDelete('single')}
              >
                이것만 지우기
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading}
                onClick={() => void executeDelete('future')}
              >
                이후 모두 지우기
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={isLoading}
                onClick={() => setDeleteScopeOpen(false)}
              >
                취소
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )

  if (isPopup) {
    if (!open || !mounted) return null

    return createPortal(
      <>
      <div
        ref={popupRef}
        className="fixed z-50 w-72 rounded-lg border border-border bg-card shadow-xl animate-in fade-in-0 zoom-in-95"
        style={{ top: popupPosition.top, left: popupPosition.left }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">
              {isAddingToSlot ? '수업 추가' : '수업 수정'}
              {!isAddingToSlot && lesson ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  · {getLessonCalendarLabel(lesson)}
                </span>
              ) : null}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!isAddingToSlot && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleAddAnotherMember}
              >
                <UserPlus className="mr-1 h-3.5 w-3.5" />
                추가
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="text-sm">
          <div className="space-y-2 px-3 py-2">{formFields}</div>
          <div className="border-t border-border px-3 py-2">{popupFooter}</div>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? '수업 수정' : '수업 추가'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? '수업 일정과 정보를 수정합니다.'
                : '드래그한 시간에 새 수업을 등록합니다.'}
            </DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
      {scopeDialogs}
    </>
  )
}
