'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  getMemoMemberSuggestions,
  parseMemoQuickAdd,
  resolveMemoMember,
  stripMemberDisplayMeta,
} from '@/lib/memo-quick-add'
import { getInstructorCalendarColor } from '@/lib/instructor-colors'
import { formatMemberCalendarLabel } from '@/lib/member-utils'

export type MemoQuickAddPayload = {
  date: string
  memberId: string | null
  title: string | null
  startTime: string
  endTime: string
}

interface MemoMember {
  id: string
  name: string
  sport?: string | null
  age?: number | null
  birth_date?: string | null
}

interface MonthMemoInputProps {
  selectedDate: Date
  members: MemoMember[]
  onSubmit: (payload: MemoQuickAddPayload) => Promise<{ error?: string } | void>
}

export function MonthMemoInput({
  selectedDate,
  members,
  onSubmit,
}: MonthMemoInputProps) {
  const [memo, setMemo] = useState('')
  const [selectedMember, setSelectedMember] = useState<MemoMember | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const parsed = useMemo(() => parseMemoQuickAdd(memo), [memo])
  const suggestions = useMemo(() => {
    if (
      selectedMember &&
      stripMemberDisplayMeta(parsed.memberQuery) === selectedMember.name
    ) {
      return []
    }
    return getMemoMemberSuggestions(members, parsed.memberQuery)
  }, [members, parsed.memberQuery, selectedMember])

  const showSuggestions = suggestions.length > 0 && parsed.memberQuery.length > 0

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [memo, suggestions.length])

  useEffect(() => {
    setMemo('')
    setSelectedMember(null)
  }, [selectedDate])

  useLayoutEffect(() => {
    if (!showSuggestions) {
      setAnchorRect(null)
      return
    }

    function updateAnchor() {
      const el = inputRef.current
      if (!el) return
      setAnchorRect(el.getBoundingClientRect())
    }

    updateAnchor()

    const inputEl = inputRef.current
    const observer = inputEl ? new ResizeObserver(updateAnchor) : null
    if (inputEl && observer) observer.observe(inputEl)

    window.addEventListener('scroll', updateAnchor, true)
    window.addEventListener('resize', updateAnchor)

    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', updateAnchor, true)
      window.removeEventListener('resize', updateAnchor)
    }
  }, [showSuggestions, suggestions])

  function applyMember(member: MemoMember) {
    setSelectedMember(member)
    const label = formatMemberCalendarLabel(member)
    const current = parseMemoQuickAdd(memo)
    if (current.startTime) {
      const [hour, minute] = current.startTime.split(':').map(Number)
      const timePart = minute > 0 ? `${hour}시 ${minute}분` : `${hour}시`
      setMemo(`${timePart} ${label}`)
    } else {
      setMemo(`${label} `)
    }
    inputRef.current?.focus()
  }

  async function submitMemo() {
    const text = memo.trim()
    if (!text) return

    const member = resolveMemoMember(members, parsed.memberQuery, selectedMember)
    const startTime = parsed.startTime ?? '09:00'
    const endTime = parsed.endTime ?? '10:00'

    if (!member && !parsed.memberQuery) {
      toast.error('회원 이름 또는 메모를 입력해주세요.')
      return
    }

    setIsSubmitting(true)
    const result = await onSubmit({
      date: format(selectedDate, 'yyyy-MM-dd'),
      memberId: member?.id ?? null,
      title: member ? null : parsed.memberQuery,
      startTime,
      endTime,
    })
    setIsSubmitting(false)

    if (result?.error) {
      toast.error('일정 추가 실패', { description: result.error })
      return
    }

    setMemo('')
    setSelectedMember(null)
    toast.success('일정이 추가되었습니다.')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault()
        const readyToSubmit =
          parsed.startTime &&
          Boolean(resolveMemoMember(members, parsed.memberQuery, selectedMember))
        if (readyToSubmit) {
          void submitMemo()
        } else {
          applyMember(suggestions[activeIndex])
        }
        return
      }
    }

    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submitMemo()
    }

    if (e.key === 'Escape') {
      setMemo('')
      setSelectedMember(null)
    }
  }

  const dateHint = format(selectedDate, 'M월 d일', { locale: ko })
  const timeHint =
    parsed.startTime && parsed.endTime
      ? `${parsed.startTime} – ${parsed.endTime}`
      : null

  const suggestionList =
    mounted && showSuggestions && anchorRect
      ? createPortal(
          <ul
            role="listbox"
            aria-label="회원 이름 자동완성"
            className="fixed z-[300] max-h-48 touch-manipulation overflow-y-auto overscroll-contain rounded-md border border-border bg-popover py-1 shadow-lg"
            style={{
              left: anchorRect.left,
              width: anchorRect.width,
              top: anchorRect.top - 4,
              transform: 'translateY(-100%)',
            }}
            onPointerDown={(e) => e.preventDefault()}
          >
            {suggestions.map((member, index) => {
              const color = getInstructorCalendarColor(null)
              const label = formatMemberCalendarLabel(member)
              return (
                <li key={member.id} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent active:bg-accent',
                      index === activeIndex && 'bg-accent',
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      applyMember(member)
                    }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                    {parsed.startTime && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {parsed.startTime}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>,
          document.body,
        )
      : null

  return (
    <div ref={containerRef} className="relative shrink-0 border-t border-border p-3">
      <div className="relative">
        <Input
          ref={inputRef}
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value)
            if (selectedMember && !e.target.value.includes(selectedMember.name)) {
              setSelectedMember(null)
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting}
          placeholder={`${dateHint} 메모 · 시간 이름`}
          className="h-11 border-dashed bg-muted/30 pr-10"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {isSubmitting && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {timeHint && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          시간: {timeHint}
          {selectedMember
            ? ` · ${formatMemberCalendarLabel(selectedMember)}`
            : parsed.memberQuery
              ? ` · ${parsed.memberQuery}`
              : ''}
        </p>
      )}

      {suggestionList}

      {!showSuggestions && parsed.memberQuery && parsed.startTime && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Enter로 {parsed.memberQuery} {parsed.startTime} 일정 추가
        </p>
      )}
    </div>
  )
}
