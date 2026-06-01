'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  buildCalendarMemberSearchResults,
  buildCalendarMonthMemberResults,
  formatMemberSearchSubtitle,
  type CalendarMemberSearchItem,
  type CalendarMemberSearchResult,
} from '@/lib/calendar-utils'
import {
  getInstructorCalendarColor,
  hexToRgba,
} from '@/lib/instructor-colors'
import { cn } from '@/lib/utils'
import type { Lesson } from '@/lib/types'

interface CalendarSearchProps {
  members: CalendarMemberSearchItem[]
  lessons: Lesson[]
  currentDate: Date
  onLoadSearchPool?: () => void
  onSelectMember: (result: CalendarMemberSearchResult) => void
  className?: string
}

export function CalendarSearch({
  members,
  lessons,
  currentDate,
  onLoadSearchPool,
  onSelectMember,
  className,
}: CalendarSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const results = useMemo(
    () => buildCalendarMemberSearchResults(members, lessons, query),
    [members, lessons, query],
  )

  const monthResults = useMemo(
    () => buildCalendarMonthMemberResults(members, lessons, currentDate),
    [members, lessons, currentDate],
  )

  const hasQuery = query.trim().length > 0
  const visibleResults = hasQuery ? results : monthResults

  const handleSelect = useCallback(
    (result: CalendarMemberSearchResult) => {
      if (!result.targetLesson) {
        toast.info('등록된 일정이 없습니다.', {
          description: `${result.member.name} 회원의 캘린더 일정이 없습니다.`,
        })
        return
      }

      onSelectMember(result)
      setOpen(false)
      setQuery('')
    },
    [onSelectMember],
  )

  useEffect(() => {
    setActiveIndex(0)
  }, [query, visibleResults.length])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setOpen(true)
        requestAnimationFrame(() => inputRef.current?.focus())
        return
      }

      if (!open) return

      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        setQuery('')
        return
      }

      if (e.key === 'ArrowDown' && visibleResults.length > 0) {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % visibleResults.length)
        return
      }

      if (e.key === 'ArrowUp' && visibleResults.length > 0) {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + visibleResults.length) % visibleResults.length)
        return
      }

      if (e.key === 'Enter' && visibleResults.length > 0) {
        e.preventDefault()
        handleSelect(visibleResults[activeIndex])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, visibleResults, activeIndex, handleSelect])

  useEffect(() => {
    if (!open) return

    onLoadSearchPool?.()
    requestAnimationFrame(() => inputRef.current?.focus())

    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return
      setOpen(false)
      setQuery('')
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open, onLoadSearchPool])

  function openSearch() {
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function closeSearch() {
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className={cn('relative flex items-center', className)}>
      <div
        className={cn(
          'flex items-center overflow-hidden rounded-md border border-border bg-background transition-all duration-200',
          open ? 'w-56 sm:w-64' : 'w-9',
        )}
      >
        {open ? (
          <>
            <Search className="ml-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="회원 이름 검색"
              className="h-9 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={closeSearch}
              title="닫기 (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={openSearch}
            title="회원 검색 (Ctrl+F)"
          >
            <Search className="h-4 w-4" />
          </Button>
        )}
      </div>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-lg sm:w-80">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-medium text-foreground">
              {hasQuery
                ? '검색 결과'
                : `${format(currentDate, 'M월', { locale: ko })} 회원 전체 (${monthResults.length}명)`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              회원 이름·종목·초성(ㅈ)으로 검색
            </p>
          </div>

          {visibleResults.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {visibleResults.map((result, index) => {
                const color = getInstructorCalendarColor(result.targetLesson?.instructor)
                const isActive = index === activeIndex

                return (
                  <li key={`${result.member.id}-${result.targetLesson?.id ?? 'none'}`}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors',
                        !isActive && 'hover:bg-accent/50',
                        !result.targetLesson && 'opacity-70',
                      )}
                      style={
                        isActive
                          ? { backgroundColor: hexToRgba(color, 0.22) }
                          : undefined
                      }
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelect(result)}
                    >
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/20"
                        style={{ backgroundColor: color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {result.member.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {formatMemberSearchSubtitle(
                            result.member,
                            result.targetLesson,
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {hasQuery
                ? `'${query.trim()}' 검색 결과가 없습니다.`
                : '이달 등록된 회원 일정이 없습니다.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
