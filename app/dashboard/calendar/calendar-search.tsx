'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
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

const MOBILE_SEARCH_MQ = '(max-width: 639px)'
const VIEWPORT_PADDING = 8

interface CalendarSearchProps {
  members: CalendarMemberSearchItem[]
  lessons: Lesson[]
  currentDate: Date
  onLoadSearchPool?: () => void
  onSelectMember: (result: CalendarMemberSearchResult) => void
  className?: string
}

function useIsMobileSearchLayout() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_SEARCH_MQ)
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isMobile
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
  const [panelTop, setPanelTop] = useState(0)
  const [dropdownLayout, setDropdownLayout] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobileSearchLayout()

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
        requestAnimationFrame(() => {
          ;(isMobile ? mobileInputRef : inputRef).current?.focus()
        })
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
  }, [open, visibleResults, activeIndex, handleSelect, isMobile])

  useEffect(() => {
    if (!open) return

    onLoadSearchPool?.()
    requestAnimationFrame(() => {
      ;(isMobile ? mobileInputRef : inputRef).current?.focus()
    })

    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return
      const panel = document.querySelector('[data-calendar-search-panel]')
      if (panel?.contains(e.target as Node)) return
      setOpen(false)
      setQuery('')
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open, onLoadSearchPool, isMobile])

  useLayoutEffect(() => {
    if (!open) {
      setDropdownLayout(null)
      setPanelTop(0)
      return
    }

    function resolvePanelTop() {
      const toolbar = document.querySelector('[data-calendar-toolbar]')
      const anchor = containerRef.current
      const anchorRect = anchor?.getBoundingClientRect()
      const toolbarRect = toolbar?.getBoundingClientRect()
      const viewportTop = window.visualViewport?.offsetTop ?? 0

      if (toolbarRect) {
        return toolbarRect.bottom + 4 - viewportTop
      }
      if (anchorRect) {
        return anchorRect.bottom + 4 - viewportTop
      }
      return VIEWPORT_PADDING
    }

    function updateDesktopDropdownLayout() {
      const anchor = containerRef.current
      if (!anchor) return

      const viewportWidth = window.visualViewport?.width ?? window.innerWidth
      const maxDropdownWidth = 320
      const width = Math.min(maxDropdownWidth, viewportWidth - VIEWPORT_PADDING * 2)
      const rect = anchor.getBoundingClientRect()
      const viewportTop = window.visualViewport?.offsetTop ?? 0
      const left = Math.max(
        VIEWPORT_PADDING,
        Math.min(rect.right - width, viewportWidth - width - VIEWPORT_PADDING),
      )

      setDropdownLayout({
        top: rect.bottom + 4 - viewportTop,
        left,
        width,
      })
    }

    function updateLayout() {
      const top = resolvePanelTop()
      setPanelTop(top)
      if (!isMobile) {
        updateDesktopDropdownLayout()
      }
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)
    window.addEventListener('scroll', updateLayout, true)
    window.visualViewport?.addEventListener('resize', updateLayout)
    window.visualViewport?.addEventListener('scroll', updateLayout)
    return () => {
      window.removeEventListener('resize', updateLayout)
      window.removeEventListener('scroll', updateLayout, true)
      window.visualViewport?.removeEventListener('resize', updateLayout)
      window.visualViewport?.removeEventListener('scroll', updateLayout)
    }
  }, [open, query, visibleResults.length, isMobile])

  function openSearch() {
    setOpen(true)
    requestAnimationFrame(() => {
      ;(isMobile ? mobileInputRef : inputRef).current?.focus()
    })
  }

  function closeSearch() {
    setOpen(false)
    setQuery('')
  }

  const resultsHeader = (
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
  )

  const resultsList =
    visibleResults.length > 0 ? (
      <ul className="max-h-[min(20rem,50vh)] overflow-y-auto py-1 sm:max-h-80">
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
                  isActive ? { backgroundColor: hexToRgba(color, 0.22) } : undefined
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
                    {formatMemberSearchSubtitle(result.member, result.targetLesson)}
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
    )

  const searchInputRow = (inputRefProp: RefObject<HTMLInputElement | null>) => (
    <div className="flex w-full items-center overflow-hidden rounded-md border border-border bg-background">
      <Search className="ml-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <Input
        ref={inputRefProp}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="회원 이름 검색"
        className="h-10 min-w-0 flex-1 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={closeSearch}
        title="닫기 (Esc)"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  const mobileSearchOverlay =
    open && isMobile ? (
      <>
        <button
          type="button"
          className="fixed inset-0 z-[58] bg-black/45"
          aria-label="검색 닫기"
          onClick={closeSearch}
        />
        <div
          data-calendar-search-panel
          className="fixed z-[60] flex max-h-[min(28rem,70vh)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
          style={{
            top: panelTop,
            left: VIEWPORT_PADDING,
            width: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
          }}
        >
          <div className="shrink-0 border-b border-border p-2">
            {searchInputRow(mobileInputRef)}
          </div>
          {resultsHeader}
          <div className="min-h-0 flex-1 overflow-y-auto">{resultsList}</div>
        </div>
      </>
    ) : null

  const desktopDropdownPanel =
    open && !isMobile ? (
      <div
        data-calendar-search-panel
        className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
        style={
          dropdownLayout
            ? {
                position: 'fixed',
                top: dropdownLayout.top,
                left: dropdownLayout.left,
                width: dropdownLayout.width,
                maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
                zIndex: 60,
              }
            : { visibility: 'hidden' }
        }
      >
        {resultsHeader}
        {resultsList}
      </div>
    ) : null

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          'relative flex items-center',
          open && isMobile && 'pointer-events-none opacity-0',
          open && !isMobile && 'w-full min-w-0 flex-1 sm:w-auto sm:flex-none',
          className,
        )}
        aria-hidden={open && isMobile}
      >
        <div
          className={cn(
            'flex items-center overflow-hidden rounded-md border border-border bg-background transition-all duration-200',
            open && !isMobile ? 'w-full min-w-[10rem] sm:w-64' : 'w-9',
          )}
        >
          {open && !isMobile ? (
            searchInputRow(inputRef)
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
      </div>

      {typeof document !== 'undefined' && open
        ? createPortal(
            <>
              {mobileSearchOverlay}
              {desktopDropdownPanel}
            </>,
            document.body,
          )
        : null}
    </>
  )
}
