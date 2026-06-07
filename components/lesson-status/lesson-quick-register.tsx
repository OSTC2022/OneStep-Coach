'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createLesson } from '@/lib/actions/lessons'
import {
  listMembersForPicker,
  searchMembersForPickerCached,
  type MemberPickerOption,
} from '@/lib/actions/members'
import { MemberSearchSelect } from '@/components/members/member-search-select'
import { InstructorSelectField } from '@/components/members/instructor-select-field'
import { SimpleTimeRangeInput } from '@/components/ui/simple-time-range-input'
import { Button } from '@/components/ui/button'
import { AUTO_INSTRUCTOR_ID, normalizePrimaryInstructorId } from '@/lib/member-utils'
import { parseSingleTimeToken } from '@/lib/time-input-parse'
import type { Instructor } from '@/types/database'
import type { Lesson } from '@/types/database'
import { cn } from '@/lib/utils'

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

interface LessonQuickRegisterProps {
  lessonDate: string
  instructors: Instructor[]
  onCreated: (lesson: Lesson) => void
  panelContainerRef: RefObject<HTMLDivElement | null>
  className?: string
}

function LessonQuickRegisterForm({
  lessonDate,
  instructors,
  pickerMembers,
  onCreated,
  onClose,
}: {
  lessonDate: string
  instructors: Instructor[]
  pickerMembers: MemberPickerOption[]
  onCreated: (lesson: Lesson) => void
  onClose: () => void
}) {
  const [memberId, setMemberId] = useState('')
  const [memberName, setMemberName] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [instructorId, setInstructorId] = useState(AUTO_INSTRUCTOR_ID)
  const [saving, setSaving] = useState(false)

  const searchMembers = useCallback(
    (query: string) => searchMembersForPickerCached(query),
    [],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!memberId) {
      toast.error('회원을 선택해주세요.')
      return
    }

    const normalizedStart = parseSingleTimeToken(startTime)
    if (!normalizedStart) {
      toast.error('시작 시간을 입력해주세요.', {
        description: '예: 18:00 또는 18:00~19:30',
      })
      return
    }

    let normalizedEnd = parseSingleTimeToken(endTime)
    if (!normalizedEnd) {
      normalizedEnd = addMinutesToTime(normalizedStart, 60)
    }

    setSaving(true)
    const result = await createLesson({
      member_id: memberId,
      lesson_date: lessonDate,
      start_time: normalizedStart,
      end_time: normalizedEnd,
      instructor_id: normalizePrimaryInstructorId(instructorId) || undefined,
      lesson_type: '개인레슨',
      attendance_status: 'present',
    })
    setSaving(false)

    if (result.error) {
      toast.error('수업 등록 실패', { description: result.error })
      return
    }

    if (result.warning) {
      toast.warning('DB 마이그레이션 필요', { description: result.warning })
    }

    if (result.data) {
      onCreated(result.data)
    }

    toast.success('수업이 등록되었습니다.', {
      description: memberName ? `${memberName} · ${normalizedStart}` : normalizedStart,
    })

    setMemberId('')
    setMemberName('')
    onClose()
  }

  return (
    <div className="flex justify-end">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex w-full max-w-2xl flex-wrap items-end gap-1.5 rounded-md border border-border bg-popover p-2.5 shadow-sm"
      >
        <div className="min-w-[8.5rem] flex-1 sm:max-w-[10.5rem]">
          <MemberSearchSelect
            value={memberId}
            onValueChange={(id, member) => {
              setMemberId(id)
              setMemberName(member?.name ?? '')
            }}
            members={pickerMembers}
            placeholder="이름 검색"
            compact
            inlineSearch
            enableRecentSearches
            suggestionsPlacement="above"
            onSearchMembers={searchMembers}
            className="space-y-0"
          />
        </div>

        <SimpleTimeRangeInput
          startValue={startTime}
          endValue={endTime}
          onStartChange={setStartTime}
          onEndChange={setEndTime}
          compact
          className="w-[7.5rem] shrink-0 gap-1"
        />

        <InstructorSelectField
          value={instructorId}
          onChange={setInstructorId}
          instructors={instructors}
          showLabel={false}
          compact
          className="w-[6.5rem] shrink-0 space-y-0"
        />

        <Button
          type="submit"
          size="sm"
          className="h-8 shrink-0 px-2.5 text-xs"
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Plus className="mr-1 h-3.5 w-3.5" />
              등록
            </>
          )}
        </Button>
      </form>
    </div>
  )
}

export function LessonQuickRegister({
  lessonDate,
  instructors,
  onCreated,
  panelContainerRef,
  className,
}: LessonQuickRegisterProps) {
  const [open, setOpen] = useState(false)
  const [pickerMembers, setPickerMembers] = useState<MemberPickerOption[]>([])
  const panelHost = panelContainerRef.current

  useEffect(() => {
    let cancelled = false
    void listMembersForPicker(100).then((rows) => {
      if (!cancelled) setPickerMembers(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <Button
        type="button"
        variant={open ? 'default' : 'outline'}
        size="sm"
        className={cn('h-8 text-xs', className)}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        빠른 등록
      </Button>

      {open && panelHost
        ? createPortal(
            <LessonQuickRegisterForm
              lessonDate={lessonDate}
              instructors={instructors}
              pickerMembers={pickerMembers}
              onCreated={onCreated}
              onClose={() => setOpen(false)}
            />,
            panelHost,
          )
        : null}
    </>
  )
}
