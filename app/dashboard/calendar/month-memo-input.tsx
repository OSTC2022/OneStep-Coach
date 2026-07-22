'use client'

import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
  stripMemberDisplayMeta,
} from '@/lib/memo-quick-add'
import { searchMembersForPickerCached } from '@/lib/actions/members'
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

const REMOTE_SEARCH_DEBOUNCE_MS = 280
/** 로컬 회원 목록이 충분하면 서버 검색을 건너뛰어 입력 지연을 막음 */
const LOCAL_CATALOG_SKIP_REMOTE = 40
const LOCAL_MATCH_SKIP_REMOTE = 6

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
  const [remoteMatches, setRemoteMatches] = useState<MemoMember[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchGenerationRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const parsed = useMemo(() => parseMemoQuickAdd(memo), [memo])
  const memberQuery = useMemo(
    () => stripMemberDisplayMeta(parsed.memberQuery),
    [parsed.memberQuery],
  )

  const localSuggestions = useMemo(() => {
    if (selectedMember && memberQuery === selectedMember.name) {
      return [] as MemoMember[]
    }
    return getMemoMemberSuggestions(members, memberQuery)
  }, [members, memberQuery, selectedMember])

  const suggestions = useMemo(() => {
    if (selectedMember && memberQuery === selectedMember.name) {
      return [] as MemoMember[]
    }

    const merged = new Map<string, MemoMember>()
    for (const member of localSuggestions) {
      merged.set(member.id, member)
    }
    for (const member of remoteMatches) {
      if (!merged.has(member.id)) {
        merged.set(member.id, member)
      }
    }

    if (remoteMatches.length === 0) {
      return localSuggestions
    }

    return getMemoMemberSuggestions(Array.from(merged.values()), memberQuery)
  }, [localSuggestions, memberQuery, selectedMember, remoteMatches])

  const showSuggestions =
    parsed.memberQuery.length > 0 && (suggestions.length > 0 || isSearching)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [memberQuery])

  useEffect(() => {
    setMemo('')
    setSelectedMember(null)
    setRemoteMatches([])
  }, [selectedDate])

  // 서버 검색은 디바운스 + 로컬 결과가 부족할 때만 (키마다 800명 조회 방지)
  useEffect(() => {
    const q = memberQuery.trim()
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    if (!q) {
      searchGenerationRef.current += 1
      setRemoteMatches([])
      setIsSearching(false)
      return
    }

    if (
      members.length >= LOCAL_CATALOG_SKIP_REMOTE &&
      localSuggestions.length >= LOCAL_MATCH_SKIP_REMOTE
    ) {
      searchGenerationRef.current += 1
      setRemoteMatches([])
      setIsSearching(false)
      return
    }

    // 로컬에 이미 결과가 있으면 검색 표시 없이 백그라운드만
    if (localSuggestions.length === 0) {
      setIsSearching(true)
    }

    const generation = ++searchGenerationRef.current
    debounceTimerRef.current = setTimeout(() => {
      void searchMembersForPickerCached(q)
        .then((rows) => {
          if (searchGenerationRef.current !== generation) return
          startTransition(() => {
            setRemoteMatches(rows)
            setIsSearching(false)
          })
        })
        .catch(() => {
          if (searchGenerationRef.current === generation) {
            setIsSearching(false)
          }
        })
    }, REMOTE_SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [memberQuery, members.length, localSuggestions.length])

  useLayoutEffect(() => {
    if (!showSuggestions) {
      setAnchorRect(null)
      return
    }

    function updateAnchor() {
      const el = inputRef.current
      if (!el) return
      const next = el.getBoundingClientRect()
      setAnchorRect((prev) => {
        if (
          prev &&
          prev.left === next.left &&
          prev.top === next.top &&
          prev.width === next.width
        ) {
          return prev
        }
        return next
      })
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
  }, [showSuggestions])

  function applyMember(member: MemoMember) {
    setSelectedMember(member)
    setRemoteMatches([])
    setIsSearching(false)
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

    const member = selectedMember
    const startTime = parsed.startTime ?? '09:00'
    const endTime = parsed.endTime ?? '10:00'

    if (!member && !parsed.memberQuery) {
      toast.error('회원 이름 또는 메모를 입력해주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await onSubmit({
        date: format(selectedDate, 'yyyy-MM-dd'),
        memberId: member?.id ?? null,
        title: member ? null : parsed.memberQuery,
        startTime,
        endTime,
      })

      if (result?.error) {
        toast.error('일정 추가 실패', { description: result.error })
        return
      }

      setMemo('')
      setSelectedMember(null)
      setRemoteMatches([])
      toast.success('일정이 추가되었습니다.')
    } catch (error) {
      console.error('submitMemo:', error)
      toast.error('일정 추가 실패', {
        description: '네트워크가 느릴 수 있습니다. 잠시 후 다시 시도해주세요.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSuggestions && suggestions.length > 0) {
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
        const member = suggestions[activeIndex]
        if (member) {
          applyMember(member)
        } else {
          void submitMemo()
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
      setRemoteMatches([])
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
            <li className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              클릭하면 바로 선택됩니다
            </li>
            {isSearching && suggestions.length === 0 ? (
              <li className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                검색중…
              </li>
            ) : null}
            {suggestions.map((member, index) => {
              const color = getInstructorCalendarColor(null)
              const label = formatMemberCalendarLabel(member)
              const isActive = index === activeIndex
              return (
                <li key={member.id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors',
                      'hover:bg-muted/70 active:bg-muted',
                      isActive && 'bg-muted text-foreground',
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
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {label}
                    </span>
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
    <div
      ref={containerRef}
      className="relative shrink-0 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 pr-20 md:pr-24"
    >
      <div className="relative">
        <Input
          ref={inputRef}
          value={memo}
          onChange={(e) => {
            const next = e.target.value
            setMemo(next)
            if (selectedMember && !next.includes(selectedMember.name)) {
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
          enterKeyHint="done"
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

      {!showSuggestions && parsed.memberQuery && !isSearching && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Enter로
          {parsed.startTime
            ? ` ${parsed.memberQuery} ${parsed.startTime} 일정 추가`
            : ` "${parsed.memberQuery}" 일정 추가 (시간 없으면 09:00–10:00)`}
          {' · '}일치하는 회원이 없으면 메모로 등록됩니다.
        </p>
      )}
    </div>
  )
}
