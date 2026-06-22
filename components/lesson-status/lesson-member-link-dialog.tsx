'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { linkLessonToMember } from '@/lib/actions/link-lesson-member'
import {
  listMembersForPicker,
  searchMembersForPickerCached,
  type MemberPickerOption,
} from '@/lib/actions/members'
import { getLessonCalendarDisplayParts } from '@/lib/calendar-utils'
import { extractMemberNameFromCalendarLabel } from '@/lib/member-utils'
import { sortMembersByPreferredName } from '@/lib/korean-search'
import { MemberSearchSelect } from '@/components/members/member-search-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Lesson } from '@/lib/types'

interface LessonMemberLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lesson: Lesson | null
  onLinked: (originalLessonId: string, lesson: Lesson, deletedIds?: string[]) => void
}

export function LessonMemberLinkDialog({
  open,
  onOpenChange,
  lesson,
  onLinked,
}: LessonMemberLinkDialogProps) {
  const [memberId, setMemberId] = useState('')
  const [memberName, setMemberName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [pickerMembers, setPickerMembers] = useState<MemberPickerOption[]>([])
  const [saving, setSaving] = useState(false)

  const preferredName = useMemo(() => {
    if (!lesson) return ''
    const display = getLessonCalendarDisplayParts(lesson)
    const label = display.meta ? `${display.name}(${display.meta})` : display.name
    return extractMemberNameFromCalendarLabel(label) || display.name
  }, [lesson])

  useEffect(() => {
    if (!open) {
      setMemberId('')
      setMemberName('')
      setSearchQuery('')
      return
    }

    setSearchQuery(preferredName)

    let cancelled = false
    void listMembersForPicker(100).then((rows) => {
      if (!cancelled) {
        setPickerMembers(sortMembersByPreferredName(rows, preferredName))
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, preferredName])

  const searchMembers = useCallback(
    (query: string) => searchMembersForPickerCached(query),
    [],
  )

  async function handleSubmit() {
    if (!lesson) return
    if (!memberId) {
      toast.error('연결할 회원을 선택해주세요.')
      return
    }

    setSaving(true)
    const result = await linkLessonToMember(lesson.id, memberId, {
      lessonType: lesson.lesson_type,
      content: lesson.content,
    })
    setSaving(false)

    if (result.error) {
      toast.error('회원 연결 실패', { description: result.error })
      return
    }

    if (result.warning) {
      toast.warning('DB 마이그레이션 필요', { description: result.warning })
    }

    if (!result.data) {
      toast.error('회원 연결 후 수업 정보를 불러오지 못했습니다.')
      return
    }

    const linked: Lesson = {
      ...result.data,
      member_id: memberId,
      member: {
        id: memberId,
        name: memberName,
      } as Lesson['member'],
    }

    onLinked(lesson.id, linked, result.deletedIds)
    onOpenChange(false)
    toast.success('회원이 연결되었습니다.', {
      description: `${memberName} · 캘린더·회원 정보에 반영됩니다.`,
    })
  }

  const label = lesson
    ? (() => {
        const display = getLessonCalendarDisplayParts(lesson)
        return display.meta ? `${display.name}(${display.meta})` : display.name
      })()
    : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            회원 연결
          </DialogTitle>
          <DialogDescription>
            {label ? (
              <>
                <strong className="text-foreground">{label}</strong> 수업을 센터
                회원과 연결합니다. 캘린더·수업현황·회원 기록에 자동 반영됩니다.
              </>
            ) : (
              '센터 회원을 선택해 수업과 연결합니다.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-1">
          <MemberSearchSelect
            value={memberId}
            onValueChange={(id, member) => {
              setMemberId(id)
              setMemberName(member?.name ?? '')
            }}
            members={pickerMembers}
            placeholder="회원 이름 검색"
            inlineSearch
            enableRecentSearches
            preferredName={preferredName}
            inputValue={searchQuery}
            onInputValueChange={setSearchQuery}
            onSearchMembers={searchMembers}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                연결 중…
              </>
            ) : (
              '연결'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
