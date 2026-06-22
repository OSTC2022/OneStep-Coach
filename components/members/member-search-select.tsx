'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Clock, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  addMemberRecentQuery,
  buildDefaultMemberPickerRows,
  buildRecentSearchRows,
  hasMemberRecentSearches,
  touchMemberRecent,
  type RecentSearchRow,
} from '@/lib/member-recent-search'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { filterSortMembersForPicker, sortMembersByPreferredName } from '@/lib/korean-search'
import { formatMemberCalendarMeta } from '@/lib/member-utils'

export interface MemberSearchOption {
  id: string
  name: string
  sport?: string | null
  age?: number | null
  birth_date?: string | null
}

function MemberOptionLabel({ member }: { member: MemberSearchOption }) {
  const meta = formatMemberCalendarMeta(member)
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate font-medium">{member.name}</span>
      {meta ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {meta}
        </span>
      ) : null}
    </span>
  )
}

interface MemberSearchSelectProps {
  value: string
  onValueChange: (value: string, member?: MemberSearchOption) => void
  members: MemberSearchOption[]
  placeholder?: string
  disabledIds?: string[]
  className?: string
  compact?: boolean
  /** 검색 입력을 항상 표시 (추가 모드용) */
  inlineSearch?: boolean
  /** 회원 검색 없이 아무 텍스트나 입력 가능 */
  allowFreeText?: boolean
  inputValue?: string
  onInputValueChange?: (value: string) => void
  /** 포커스 시 최근 검색·회원 목록 (localStorage + 활성 회원) */
  enableRecentSearches?: boolean
  maxRecentSearches?: number
  /** 서버 검색 (캘린더 등 전체 회원 미로드 시) */
  onSearchMembers?: (query: string) => Promise<MemberSearchOption[]>
  /** 수업·캘린더 라벨과 동일한 이름 회원 우선 */
  preferredName?: string
  /** 제안 목록을 입력 위·아래 중 어디에 띄울지 */
  suggestionsPlacement?: 'below' | 'above'
}

export function MemberSearchSelect({
  value,
  onValueChange,
  members,
  placeholder = '이름 검색',
  disabledIds = [],
  className,
  compact = false,
  inlineSearch = false,
  allowFreeText = false,
  inputValue,
  onInputValueChange,
  enableRecentSearches = false,
  maxRecentSearches = 10,
  onSearchMembers,
  preferredName,
  suggestionsPlacement = 'below',
}: MemberSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [remoteMatches, setRemoteMatches] = useState<MemberSearchOption[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchGenerationRef = useRef(0)
  const [internalQuery, setInternalQuery] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [recentRows, setRecentRows] = useState<RecentSearchRow[]>([])
  const [hasStoredRecent, setHasStoredRecent] = useState(false)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = members.find((m) => m.id === value)
  const query = inputValue ?? internalQuery

  const sortedMembers = useMemo(
    () => sortMembersByPreferredName(members, preferredName),
    [members, preferredName],
  )

  function setQuery(next: string) {
    if (onInputValueChange) {
      onInputValueChange(next)
    } else {
      setInternalQuery(next)
    }
  }

  useEffect(() => {
    if (inputValue !== undefined) return
    if (value && selected) {
      setInternalQuery(selected.name)
    } else if (!value) {
      setInternalQuery('')
    }
  }, [value, selected?.name, inputValue])

  useEffect(() => {
    if (!onSearchMembers) {
      setRemoteMatches([])
      setIsSearching(false)
      return
    }
    const q = query.trim()
    if (q.length < 1) {
      setRemoteMatches([])
      setIsSearching(false)
      return
    }

    const generation = ++searchGenerationRef.current
    setIsSearching(true)

    void onSearchMembers(q)
      .then((rows) => {
        if (searchGenerationRef.current !== generation) return
        setRemoteMatches(rows)
        setIsSearching(false)
      })
      .catch(() => {
        if (searchGenerationRef.current === generation) {
          setIsSearching(false)
        }
      })
  }, [query, onSearchMembers])

  const localFiltered = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    return filterSortMembersForPicker(sortedMembers, q, {
      preferredName,
      limit: 15,
    })
  }, [sortedMembers, query, preferredName])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) {
      return filterSortMembersForPicker(sortedMembers, '', { preferredName, limit: 12 })
    }
    if (!onSearchMembers) {
      return filterSortMembersForPicker(sortedMembers, q, { preferredName, limit: 15 })
    }

    const merged = new Map<string, MemberSearchOption>()
    for (const member of localFiltered) {
      merged.set(member.id, member)
    }
    for (const member of remoteMatches) {
      if (!merged.has(member.id)) {
        merged.set(member.id, member)
      }
    }
    return sortMembersByPreferredName(Array.from(merged.values()), preferredName).slice(0, 15)
  }, [sortedMembers, query, onSearchMembers, localFiltered, remoteMatches, preferredName])

  const hasLocalMatches = localFiltered.length > 0
  const showSearchingHint =
    Boolean(onSearchMembers) &&
    query.trim().length >= 1 &&
    isSearching &&
    !hasLocalMatches

  function isMemberDisabled(member: MemberSearchOption) {
    return disabledIds.includes(member.id) && member.id !== value
  }

  function refreshRecentRows() {
    const stored = hasMemberRecentSearches()
    setHasStoredRecent(stored)
    if (stored) {
      setRecentRows(buildRecentSearchRows(sortedMembers, maxRecentSearches))
    } else {
      setRecentRows(buildDefaultMemberPickerRows(sortedMembers, maxRecentSearches))
    }
  }

  function bumpAndRefresh(entry: { id?: string; name: string }) {
    if (!enableRecentSearches) return
    touchMemberRecent(entry, maxRecentSearches)
    refreshRecentRows()
  }

  function closePickers() {
    setSuggestOpen(false)
    setSearchOpen(false)
  }

  const inlinePickerOpen = suggestOpen || searchOpen

  useEffect(() => {
    if (!inlinePickerOpen) return
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return
      closePickers()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [inlinePickerOpen])

  function selectMember(member: MemberSearchOption) {
    if (isMemberDisabled(member)) {
      toast.error('이미 같은 시간에 배정된 회원입니다.')
      return
    }
    bumpAndRefresh({ id: member.id, name: member.name })
    onValueChange(member.id, member)
    setQuery(member.name)
    closePickers()
  }

  function selectRecentRow(row: RecentSearchRow) {
    bumpAndRefresh(row.entry)
    refreshRecentRows()

    if (row.member) {
      if (isMemberDisabled(row.member)) {
        toast.error('이미 같은 시간에 배정된 회원입니다.')
        closePickers()
        return
      }
      onValueChange(row.member.id, row.member)
      setQuery(row.member.name)
      closePickers()
      return
    }

    setQuery(row.label)
    if (!row.member) {
      onValueChange('')
    }
    closePickers()
  }

  function clearBlurTimeout() {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
  }

  function openFocusSuggestions() {
    if (!enableRecentSearches || query.trim()) return
    const stored = hasMemberRecentSearches()
    const rows = stored
      ? buildRecentSearchRows(sortedMembers, maxRecentSearches)
      : buildDefaultMemberPickerRows(sortedMembers, maxRecentSearches)
    setHasStoredRecent(stored)
    setRecentRows(rows)
    setSuggestOpen(rows.length > 0)
  }

  useEffect(() => {
    if (!inlineSearch || !preferredName?.trim()) return
    const q = query.trim()
    if (q && q === preferredName.trim()) {
      setSearchOpen(true)
      setSuggestOpen(false)
    }
  }, [inlineSearch, preferredName, query])

  function scheduleClosePickers() {
    clearBlurTimeout()
    blurTimeoutRef.current = setTimeout(() => {
      if (containerRef.current?.contains(document.activeElement)) return
      closePickers()
    }, 200)
  }

  function handleInputBlur() {
    const trimmed = query.trim()
    if (enableRecentSearches && trimmed.length >= 1) {
      addMemberRecentQuery(trimmed, maxRecentSearches)
    }
    scheduleClosePickers()
  }

  useEffect(() => () => clearBlurTimeout(), [])

  const suggestionListClass =
    suggestionsPlacement === 'above'
      ? 'absolute bottom-full left-0 right-0 z-50 mb-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md'
      : 'relative z-50 max-h-48 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md'

  if (inlineSearch || allowFreeText) {
    return (
      <div ref={containerRef} className={cn('space-y-1.5', className)}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={query}
            onFocus={() => {
              clearBlurTimeout()
              if (query.trim()) {
                setSearchOpen(true)
              } else {
                openFocusSuggestions()
              }
            }}
            onClick={() => {
              clearBlurTimeout()
              if (query.trim()) {
                setSearchOpen(true)
              } else {
                openFocusSuggestions()
              }
            }}
            onBlur={handleInputBlur}
            onChange={(e) => {
              const next = e.target.value
              setQuery(next)
              if (next.trim()) {
                setSuggestOpen(false)
                setSearchOpen(true)
              } else {
                setSearchOpen(false)
                if (enableRecentSearches) {
                  openFocusSuggestions()
                }
              }
              if (value && selected && next !== selected.name) {
                onValueChange('')
              }
            }}
            className={cn('pl-8', compact && 'h-8 text-sm')}
          />
          {enableRecentSearches && suggestOpen && !query.trim() && recentRows.length > 0 && (
            <div
              data-inline-picker-open="true"
              className={suggestionListClass}
              onMouseDown={(e) => e.preventDefault()}
            >
              <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {hasStoredRecent ? '최근 검색' : '회원 목록'}
              </p>
              {recentRows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => selectRecentRow(row)}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {row.label}
                </button>
              ))}
            </div>
          )}
          {searchOpen && query.trim() && (filtered.length > 0 || showSearchingHint) && (
            <div
              data-inline-picker-open="true"
              className={suggestionListClass}
              onMouseDown={(e) => e.preventDefault()}
            >
              {showSearchingHint ? (
                <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  검색중…
                </p>
              ) : null}
              {filtered.map((m) => {
                const blocked = isMemberDisabled(m)
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={blocked}
                    className={cn(
                      'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm',
                      blocked
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:bg-accent',
                    )}
                    onClick={() => selectMember(m)}
                  >
                    <MemberOptionLabel member={m} />
                    {blocked ? (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        배정됨
                      </span>
                    ) : null}
                  </button>
                )
              })}
              {isSearching && filtered.length > 0 ? (
                <p className="flex items-center gap-1.5 border-t border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  검색중…
                </p>
              ) : null}
            </div>
          )}
        </div>
        {searchOpen &&
          !allowFreeText &&
          query.trim() &&
          !isSearching &&
          filtered.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">회원을 찾을 수 없습니다.</p>
        )}
        {!allowFreeText && selected && !query && (
          <p className="px-1 text-xs text-muted-foreground">
            선택: <MemberOptionLabel member={selected} />
          </p>
        )}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            compact && 'h-8 text-sm',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {!selected && <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />}
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="이름 검색..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>회원을 찾을 수 없습니다.</CommandEmpty>
            <CommandGroup>
              {(query.trim()
                ? filtered
                : filterSortMembersForPicker(sortedMembers, '', { preferredName, limit: 12 })
              ).map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name}
                  disabled={isMemberDisabled(m)}
                  onSelect={() => {
                    if (isMemberDisabled(m)) {
                      toast.error('이미 같은 시간에 배정된 회원입니다.')
                      return
                    }
                    onValueChange(m.id === value ? '' : m.id, m.id === value ? undefined : m)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === m.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <MemberOptionLabel member={m} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
