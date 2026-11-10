'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  toggleMarathonEventSignup,
  toggleMarathonEventPinned,
  updateMarathonEventSignupDistances,
  getCenterMarathonScheduleForMember,
  refreshMarathonCatalog,
  staffAddMarathonEventSignup,
  staffRemoveMarathonEventSignup,
  type CenterMarathonScheduleBundle,
} from '@/lib/actions/center-marathon-schedule'
import {
  listAdultRunningMembersForPicker,
  type MemberPickerOption,
} from '@/lib/actions/members'
import {
  compareMarathonEventsForDisplay,
  formatMarathonDistanceLabel,
  formatMarathonDistancesLabel,
  formatMarathonMonthLabel,
  listNearbyMarathonMonthKeys,
  marathonEventMatchesDistanceFilters,
  MARATHON_DISTANCE_FILTERS,
  MARATHON_SCHEDULE_ALL_KEY,
  resolveMarathonEventDistanceOptions,
  type MarathonDistanceFilter,
  type MarathonEventSignup,
  type MarathonEventView,
} from '@/lib/running-league/marathon-schedule'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { matchKoreanNameSearch } from '@/lib/korean-search'
import { cn } from '@/lib/utils'
import {
  MEMBER_PORTAL_CARD_CLASS,
  MEMBER_PORTAL_SHELL_CLASS,
} from '@/lib/running-league/member-portal-layout'
import { MarathonEventLabels } from '@/components/dashboard/marathon-event-labels'

type MemberMarathonScheduleProps = {
  bundle: CenterMarathonScheduleBundle
  canParticipate: boolean
  readOnly?: boolean
  embedded?: boolean
  /** 카드 헤더 없이 본문만 (상단 메뉴 스트립용) */
  contentOnly?: boolean
  showManageLink?: boolean
  /** 관리자·강사 — 상단 고정 토글 */
  canPinEvents?: boolean
  /** 관리자·강사 — 참여 목록에 회원 추가 */
  canStaffAddParticipants?: boolean
  className?: string
  onMonthChange?: (monthKey: string) => void
}

export function MemberMarathonSchedule({
  bundle,
  canParticipate,
  readOnly = false,
  embedded = false,
  contentOnly = false,
  showManageLink = false,
  canPinEvents = false,
  canStaffAddParticipants = false,
  className,
  onMonthChange,
}: MemberMarathonScheduleProps) {
  const canManageParticipants = canStaffAddParticipants || canPinEvents
  const [pending, startTransition] = useTransition()
  const [pendingEventId, setPendingEventId] = useState<string | null>(null)
  const [pendingPinId, setPendingPinId] = useState<string | null>(null)
  const [events, setEvents] = useState(bundle.events)
  const [tableReady, setTableReady] = useState(bundle.tableReady)
  const [monthKey, setMonthKey] = useState(bundle.monthKey)
  const selectedMonthRef = useRef(bundle.monthKey)
  const [activeEvent, setActiveEvent] = useState<MarathonEventView | null>(null)
  const [sectionOpen, setSectionOpen] = useState(contentOnly)
  const [distanceFilters, setDistanceFilters] = useState<MarathonDistanceFilter[]>([])
  const [mySignupsOnly, setMySignupsOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [signupDraft, setSignupDraft] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(bundle.events.map((event) => [event.id, event.is_signed_up])),
  )
  const [countDraft, setCountDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(bundle.events.map((event) => [event.id, event.signup_count])),
  )
  const [pinDraft, setPinDraft] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(bundle.events.map((event) => [event.id, event.is_pinned])),
  )
  const [distanceDraft, setDistanceDraft] = useState<
    Record<string, MarathonDistanceFilter[]>
  >(() =>
    Object.fromEntries(bundle.events.map((event) => [event.id, event.my_distances ?? []])),
  )
  const [distancePicker, setDistancePicker] = useState<{
    event: MarathonEventView
    mode: 'join' | 'edit' | 'staff-add'
    member?: MemberPickerOption
  } | null>(null)
  const [viewerMemberId, setViewerMemberId] = useState(bundle.viewerMemberId)
  const [viewerMemberName, setViewerMemberName] = useState(bundle.viewerMemberName)

  const monthOptions = useMemo(
    () => [MARATHON_SCHEDULE_ALL_KEY, ...listNearbyMarathonMonthKeys()],
    [],
  )

  useEffect(() => {
    selectedMonthRef.current = monthKey
  }, [monthKey])

  useEffect(() => {
    const selected = selectedMonthRef.current
    // 서버 bundle이 기본 월로 갱신돼도, 사용자가 보고 있던 월은 유지
    if (selected !== bundle.monthKey) {
      let cancelled = false
      void getCenterMarathonScheduleForMember(selected).then((nextBundle) => {
        if (cancelled) return
        if (selectedMonthRef.current !== selected) return
        setEvents(nextBundle.events)
        setTableReady(nextBundle.tableReady)
        setMonthKey(nextBundle.monthKey)
        selectedMonthRef.current = nextBundle.monthKey
        setSignupDraft(
          Object.fromEntries(
            nextBundle.events.map((event) => [event.id, event.is_signed_up]),
          ),
        )
        setCountDraft(
          Object.fromEntries(
            nextBundle.events.map((event) => [event.id, event.signup_count]),
          ),
        )
        setPinDraft(
          Object.fromEntries(
            nextBundle.events.map((event) => [event.id, event.is_pinned]),
          ),
        )
        setDistanceDraft(
          Object.fromEntries(
            nextBundle.events.map((event) => [event.id, event.my_distances ?? []]),
          ),
        )
        setViewerMemberId(nextBundle.viewerMemberId)
        setViewerMemberName(nextBundle.viewerMemberName)
      })
      return () => {
        cancelled = true
      }
    }

    setEvents(bundle.events)
    setTableReady(bundle.tableReady)
    setMonthKey(bundle.monthKey)
    selectedMonthRef.current = bundle.monthKey
    setSignupDraft(
      Object.fromEntries(bundle.events.map((event) => [event.id, event.is_signed_up])),
    )
    setCountDraft(
      Object.fromEntries(bundle.events.map((event) => [event.id, event.signup_count])),
    )
    setPinDraft(
      Object.fromEntries(bundle.events.map((event) => [event.id, event.is_pinned])),
    )
    setDistanceDraft(
      Object.fromEntries(bundle.events.map((event) => [event.id, event.my_distances ?? []])),
    )
    setViewerMemberId(bundle.viewerMemberId)
    setViewerMemberName(bundle.viewerMemberName)
    setActiveEvent((current) => {
      if (!current) return current
      return bundle.events.find((event) => event.id === current.id) ?? null
    })
  }, [bundle])

  function applyScheduleBundle(nextBundle: CenterMarathonScheduleBundle) {
    setEvents(nextBundle.events)
    setTableReady(nextBundle.tableReady)
    setSignupDraft(
      Object.fromEntries(nextBundle.events.map((event) => [event.id, event.is_signed_up])),
    )
    setCountDraft(
      Object.fromEntries(nextBundle.events.map((event) => [event.id, event.signup_count])),
    )
    setPinDraft(
      Object.fromEntries(nextBundle.events.map((event) => [event.id, event.is_pinned])),
    )
    setDistanceDraft(
      Object.fromEntries(nextBundle.events.map((event) => [event.id, event.my_distances ?? []])),
    )
    setViewerMemberId(nextBundle.viewerMemberId)
    setViewerMemberName(nextBundle.viewerMemberName)
    setActiveEvent((current) => {
      if (!current) return current
      return nextBundle.events.find((event) => event.id === current.id) ?? null
    })
  }

  async function handleRefreshSchedule() {
    setRefreshing(true)
    try {
      if (showManageLink) {
        const result = await refreshMarathonCatalog()
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success(result.message)
      }
      const nextBundle = await getCenterMarathonScheduleForMember(selectedMonthRef.current)
      applyScheduleBundle(nextBundle)
      if (!showManageLink) toast.success('마라톤 일정을 다시 불러왔습니다.')
    } catch {
      toast.error('마라톤 일정을 다시 불러오지 못했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim()
    const list = events.filter((event) => {
      if (!marathonEventMatchesDistanceFilters(event, distanceFilters)) return false
      if (mySignupsOnly) {
        if (!(signupDraft[event.id] ?? event.is_signed_up)) return false
      }
      if (query) {
        const parts = [
          event.title,
          event.location_label,
          event.region,
          event.notes,
          event.event_date_label,
          event.weekday_label,
          ...(event.custom_labels?.map((label) => label.text) ?? []),
        ]
        const haystack = parts.filter(Boolean).join(' ')
        const matched =
          matchKoreanNameSearch(haystack, query) ||
          parts.some(
            (part) =>
              Boolean(part) &&
              (matchKoreanNameSearch(part!, query) ||
                part!.toLowerCase().includes(query.toLowerCase())),
          )
        if (!matched) return false
      }
      return true
    })
    return [...list]
      .map((event) => ({
        ...event,
        is_pinned: pinDraft[event.id] ?? event.is_pinned,
      }))
      .sort(compareMarathonEventsForDisplay)
  }, [events, distanceFilters, mySignupsOnly, signupDraft, pinDraft, searchQuery])

  const signedUpCount = filteredEvents.filter(
    (event) => signupDraft[event.id] ?? event.is_signed_up,
  ).length
  const mySignupTotal = events.filter(
    (event) => signupDraft[event.id] ?? event.is_signed_up,
  ).length

  function toggleDistanceFilter(id: MarathonDistanceFilter) {
    setDistanceFilters((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  function handleMonthChange(next: string) {
    if (next === selectedMonthRef.current && next === monthKey) {
      return
    }
    selectedMonthRef.current = next
    setMonthKey(next)
    if (onMonthChange) {
      onMonthChange(next)
      return
    }
    startTransition(async () => {
      const nextBundle = await getCenterMarathonScheduleForMember(next)
      // 사용자가 다른 월로 이미 바꾼 경우 무시
      if (selectedMonthRef.current !== next && selectedMonthRef.current !== nextBundle.monthKey) {
        return
      }
      setEvents(nextBundle.events)
      setTableReady(nextBundle.tableReady)
      setMonthKey(nextBundle.monthKey)
      selectedMonthRef.current = nextBundle.monthKey
      setSignupDraft(
        Object.fromEntries(nextBundle.events.map((event) => [event.id, event.is_signed_up])),
      )
      setCountDraft(
        Object.fromEntries(nextBundle.events.map((event) => [event.id, event.signup_count])),
      )
      setPinDraft(
        Object.fromEntries(nextBundle.events.map((event) => [event.id, event.is_pinned])),
      )
      setDistanceDraft(
        Object.fromEntries(
          nextBundle.events.map((event) => [event.id, event.my_distances ?? []]),
        ),
      )
      setViewerMemberId(nextBundle.viewerMemberId)
      setViewerMemberName(nextBundle.viewerMemberName)
    })
  }

  function toggleMySignupsOnly() {
    setMySignupsOnly((current) => !current)
  }

  function togglePin(event: MarathonEventView) {
    if (!canPinEvents) return
    const previous = pinDraft[event.id] ?? event.is_pinned
    const optimistic = !previous
    setPinDraft((current) => ({ ...current, [event.id]: optimistic }))
    setPendingPinId(event.id)

    startTransition(async () => {
      const result = await toggleMarathonEventPinned(event.id)
      setPendingPinId(null)
      if (!result.ok) {
        setPinDraft((current) => ({ ...current, [event.id]: previous }))
        toast.error(result.error)
        return
      }
      setPinDraft((current) => ({ ...current, [event.id]: result.pinned }))
      setEvents((current) =>
        current.map((row) =>
          row.id === event.id ? { ...row, is_pinned: result.pinned } : row,
        ),
      )
      toast.success(result.pinned ? '상단에 고정했습니다.' : '고정을 해제했습니다.')
    })
  }

  function toggleSignup(event: MarathonEventView) {
    if (readOnly || !canParticipate) {
      toast.error('로그인 후 참여 신청할 수 있습니다.')
      return
    }

    const isSignedUp = signupDraft[event.id] ?? event.is_signed_up
    if (isSignedUp) {
      if (!window.confirm(`${event.title} 참여를 취소할까요?`)) return
      submitSignupToggle(event, [])
      return
    }

    setDistancePicker({ event, mode: 'join' })
  }

  function openEditDistances(event: MarathonEventView) {
    if (readOnly || !canParticipate) return
    setDistancePicker({ event, mode: 'edit' })
  }

  function patchEventOwnSignup(
    eventId: string,
    next: {
      is_signed_up: boolean
      signup_count: number
      my_distances: MarathonDistanceFilter[]
      signups: MarathonEventSignup[]
    },
  ) {
    setSignupDraft((current) => ({ ...current, [eventId]: next.is_signed_up }))
    setCountDraft((current) => ({ ...current, [eventId]: next.signup_count }))
    setDistanceDraft((current) => ({ ...current, [eventId]: next.my_distances }))
    setEvents((current) =>
      current.map((row) =>
        row.id === eventId
          ? {
              ...row,
              is_signed_up: next.is_signed_up,
              signup_count: next.signup_count,
              my_distances: next.my_distances,
              signups: next.signups,
            }
          : row,
      ),
    )
    setActiveEvent((current) =>
      current && current.id === eventId
        ? {
            ...current,
            is_signed_up: next.is_signed_up,
            signup_count: next.signup_count,
            my_distances: next.my_distances,
            signups: next.signups,
          }
        : current,
    )
  }

  function submitSignupToggle(
    event: MarathonEventView,
    distances: MarathonDistanceFilter[],
  ) {
    const previous = signupDraft[event.id] ?? event.is_signed_up
    const previousCount = countDraft[event.id] ?? event.signup_count
    const previousDistances = distanceDraft[event.id] ?? event.my_distances ?? []
    const previousSignups = event.signups
    const optimistic = !previous
    const memberId = viewerMemberId
    const optimisticSignups =
      memberId == null
        ? event.signups
        : patchMemberSignups(event.signups, memberId, {
            signedUp: optimistic,
            distances,
            memberName: viewerMemberName ?? '회원',
          })

    setSignupDraft((current) => ({ ...current, [event.id]: optimistic }))
    setCountDraft((current) => ({
      ...current,
      [event.id]: Math.max(0, previousCount + (optimistic ? 1 : -1)),
    }))
    setDistanceDraft((current) => ({
      ...current,
      [event.id]: optimistic ? distances : [],
    }))
    setEvents((current) =>
      current.map((row) =>
        row.id === event.id
          ? {
              ...row,
              is_signed_up: optimistic,
              signup_count: Math.max(0, previousCount + (optimistic ? 1 : -1)),
              my_distances: optimistic ? distances : [],
              signups: optimisticSignups,
            }
          : row,
      ),
    )
    setActiveEvent((current) =>
      current && current.id === event.id
        ? {
            ...current,
            is_signed_up: optimistic,
            signup_count: Math.max(0, previousCount + (optimistic ? 1 : -1)),
            my_distances: optimistic ? distances : [],
            signups: optimisticSignups,
          }
        : current,
    )
    setPendingEventId(event.id)

    startTransition(async () => {
      const result = await toggleMarathonEventSignup(
        event.id,
        optimistic ? distances : undefined,
      )
      setPendingEventId(null)

      if (!result.ok) {
        patchEventOwnSignup(event.id, {
          is_signed_up: previous,
          signup_count: previousCount,
          my_distances: previousDistances,
          signups: previousSignups,
        })
        toast.error(result.error)
        return
      }

      if (result.memberId) {
        setViewerMemberId(result.memberId)
        if (result.signup?.member_name) {
          setViewerMemberName(result.signup.member_name)
        }
      }

      const nextSignups = patchMemberSignups(
        previousSignups,
        result.memberId,
        {
          signedUp: result.signedUp,
          distances: result.distances,
          memberName:
            result.signup?.member_name ?? viewerMemberName ?? '회원',
          signedAt: result.signup?.signed_at,
        },
      )

      patchEventOwnSignup(event.id, {
        is_signed_up: result.signedUp,
        signup_count: result.signupCount,
        my_distances: result.signedUp ? result.distances : [],
        signups: nextSignups,
      })
      toast.success(
        result.signedUp
          ? `참여 신청했습니다. (${formatMarathonDistancesLabel(result.distances)})`
          : '참여를 취소했습니다.',
      )
    })
  }

  function submitDistanceUpdate(
    event: MarathonEventView,
    distances: MarathonDistanceFilter[],
  ) {
    const previous = distanceDraft[event.id] ?? event.my_distances ?? []
    const previousSignups = event.signups
    const memberId = viewerMemberId
    const optimisticSignups =
      memberId == null
        ? event.signups
        : patchMemberSignups(event.signups, memberId, {
            signedUp: true,
            distances,
            memberName: viewerMemberName ?? '회원',
          })

    setDistanceDraft((current) => ({ ...current, [event.id]: distances }))
    setEvents((current) =>
      current.map((row) =>
        row.id === event.id
          ? { ...row, my_distances: distances, signups: optimisticSignups }
          : row,
      ),
    )
    setActiveEvent((current) =>
      current && current.id === event.id
        ? { ...current, my_distances: distances, signups: optimisticSignups }
        : current,
    )
    setPendingEventId(event.id)
    startTransition(async () => {
      const result = await updateMarathonEventSignupDistances(event.id, distances)
      setPendingEventId(null)
      if (!result.ok) {
        setDistanceDraft((current) => ({ ...current, [event.id]: previous }))
        setEvents((current) =>
          current.map((row) =>
            row.id === event.id
              ? { ...row, my_distances: previous, signups: previousSignups }
              : row,
          ),
        )
        setActiveEvent((current) =>
          current && current.id === event.id
            ? { ...current, my_distances: previous, signups: previousSignups }
            : current,
        )
        toast.error(result.error)
        return
      }
      const nextSignups =
        memberId == null
          ? event.signups
          : patchMemberSignups(previousSignups, memberId, {
              signedUp: true,
              distances: result.distances,
              memberName: viewerMemberName ?? '회원',
            })
      setDistanceDraft((current) => ({ ...current, [event.id]: result.distances }))
      setEvents((current) =>
        current.map((row) =>
          row.id === event.id
            ? {
                ...row,
                my_distances: result.distances,
                signups: nextSignups,
              }
            : row,
        ),
      )
      setActiveEvent((current) =>
        current && current.id === event.id
          ? {
              ...current,
              my_distances: result.distances,
              signups: nextSignups,
            }
          : current,
      )
      toast.success(`종목을 변경했습니다. (${formatMarathonDistancesLabel(result.distances)})`)
    })
  }

  function handleDistancePickerConfirm(distances: MarathonDistanceFilter[]) {
    if (!distancePicker) return
    const { event, mode, member } = distancePicker
    setDistancePicker(null)

    if (mode === 'join') {
      submitSignupToggle(event, distances)
      return
    }
    if (mode === 'edit') {
      submitDistanceUpdate(event, distances)
      return
    }
    if (mode === 'staff-add' && member) {
      handleStaffAddParticipantWithDistances(member, event, distances)
    }
  }

  if (!embedded && !tableReady) {
    return null
  }

  const collapsedSummary =
    filteredEvents.length > 0
      ? `${filteredEvents.length}개 대회${signedUpCount > 0 ? ` · ${signedUpCount}개 참여` : ''}`
      : tableReady
        ? searchQuery.trim()
          ? '검색 결과 없음'
          : mySignupsOnly
            ? '참여 중인 대회 없음'
            : distanceFilters.length > 0
              ? '선택한 종목 일정 없음'
              : '등록된 일정 없음'
        : '준비 중'

  const scheduleBody = (
    <div className={cn(contentOnly ? 'space-y-1.5' : 'space-y-1.5 p-2.5 sm:p-3')}>
      <div className="flex flex-wrap items-center gap-2 px-0.5 pb-1">
        <Select value={monthKey} onValueChange={handleMonthChange} disabled={pending}>
          <SelectTrigger className="h-8 w-[9.5rem] border-lime-500/20 bg-black/40 text-xs">
            <SelectValue placeholder="보기 선택" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((key) => (
              <SelectItem key={key} value={key}>
                {formatMarathonMonthLabel(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-lime-500/25 bg-black/40 px-2 text-[11px] text-lime-100"
          disabled={refreshing || pending}
          onClick={() => void handleRefreshSchedule()}
        >
          {refreshing ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          )}
          새로고침
        </Button>
        {showManageLink ? (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 border-lime-500/25 bg-lime-500/5 px-2 text-[11px] text-lime-100"
          >
            <Link href="/dashboard/settings/marathon-schedule">
              <Settings2 className="mr-1 h-3.5 w-3.5" />
              관리
            </Link>
          </Button>
        ) : null}
        <div className="relative min-w-[10rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="대회명·지역 검색"
            className="h-8 border-lime-500/20 bg-black/40 pl-8 text-xs placeholder:text-zinc-500"
            aria-label="대회 검색"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-0.5 pb-1">
        <button
          type="button"
          onClick={toggleMySignupsOnly}
          className={cn(
            'rounded-md border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors',
            mySignupsOnly
              ? 'border-primary/55 bg-primary/20 text-primary'
              : 'border-zinc-700 bg-black/40 text-zinc-400 hover:border-primary/35 hover:text-zinc-200',
          )}
          aria-pressed={mySignupsOnly}
        >
          내 참여{mySignupTotal > 0 ? ` ${mySignupTotal}` : ''}
        </button>
        {MARATHON_DISTANCE_FILTERS.map((filter) => {
          const active = distanceFilters.includes(filter.id)
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => toggleDistanceFilter(filter.id)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors',
                active
                  ? 'border-lime-400/50 bg-lime-500/20 text-lime-100'
                  : 'border-zinc-700 bg-black/40 text-zinc-400 hover:border-lime-500/30 hover:text-zinc-200',
              )}
              aria-pressed={active}
            >
              {filter.label}
            </button>
          )
        })}
      </div>

      {!tableReady ? (
        <p className="px-2 py-6 text-center text-sm text-zinc-500">
          마라톤 일정 기능을 준비 중입니다.
        </p>
      ) : filteredEvents.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-zinc-500">
          {searchQuery.trim()
            ? '검색 결과가 없습니다.'
            : mySignupsOnly
              ? '참여 신청한 대회가 없습니다.'
              : distanceFilters.length > 0
                ? '선택한 종목이 포함된 대회가 없습니다.'
                : monthKey === MARATHON_SCHEDULE_ALL_KEY
                  ? '등록된 대회 일정이 없습니다.'
                  : '이 달 등록된 대회 일정이 없습니다.'}
        </p>
      ) : (
        filteredEvents.map((event) => (
          <MarathonEventRow
            key={event.id}
            event={event}
            pending={pending && pendingEventId === event.id}
            pinPending={pending && pendingPinId === event.id}
            readOnly={readOnly}
            canParticipate={canParticipate}
            canPin={canPinEvents}
            isSignedUp={signupDraft[event.id] ?? event.is_signed_up}
            isPinned={pinDraft[event.id] ?? event.is_pinned}
            signupCount={countDraft[event.id] ?? event.signup_count}
            myDistances={distanceDraft[event.id] ?? event.my_distances ?? []}
            onOpenParticipants={() => setActiveEvent(event)}
            onToggleSignup={() => toggleSignup(event)}
            onEditDistances={() => openEditDistances(event)}
            onTogglePin={() => togglePin(event)}
          />
        ))
      )}
    </div>
  )

  function patchEventSignups(
    eventId: string,
    next: { signup_count: number; signups: MarathonEventView['signups'] },
  ) {
    setCountDraft((current) => ({ ...current, [eventId]: next.signup_count }))
    setEvents((current) =>
      current.map((row) =>
        row.id === eventId
          ? { ...row, signup_count: next.signup_count, signups: next.signups }
          : row,
      ),
    )
    setActiveEvent((current) =>
      current && current.id === eventId
        ? { ...current, signup_count: next.signup_count, signups: next.signups }
        : current,
    )
  }

  function handleStaffAddParticipant(member: MemberPickerOption) {
    if (!activeEvent || pending) return
    setDistancePicker({ event: activeEvent, mode: 'staff-add', member })
  }

  function handleStaffAddParticipantWithDistances(
    member: MemberPickerOption,
    event: MarathonEventView,
    distances: MarathonDistanceFilter[],
  ) {
    if (pending) return
    setPendingEventId(event.id)
    startTransition(async () => {
      const result = await staffAddMarathonEventSignup(event.id, member.id, distances)
      setPendingEventId(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const nextSignups = patchMemberSignups(event.signups, member.id, {
        signedUp: true,
        distances: result.signup.distances,
        memberName: result.signup.member_name,
        signedAt: result.signup.signed_at,
      })
      patchEventSignups(event.id, {
        signup_count: result.signupCount,
        signups: nextSignups,
      })
      toast.success(
        result.alreadySignedUp
          ? `${member.name} 님 종목을 업데이트했습니다. (${formatMarathonDistancesLabel(result.signup.distances)})`
          : `${member.name} 님을 참가자로 추가했습니다. (${formatMarathonDistancesLabel(result.signup.distances)})`,
      )
    })
  }

  function handleStaffRemoveParticipant(memberId: string, memberName: string) {
    if (!activeEvent || pending) return
    if (!window.confirm(`${memberName} 님을 참여 목록에서 제거할까요?`)) return
    setPendingEventId(activeEvent.id)
    startTransition(async () => {
      const result = await staffRemoveMarathonEventSignup(activeEvent.id, memberId)
      setPendingEventId(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      patchEventSignups(activeEvent.id, {
        signup_count: result.signupCount,
        signups: activeEvent.signups.filter((signup) => signup.member_id !== memberId),
      })
      toast.success(`${memberName} 님을 참여 목록에서 제거했습니다.`)
    })
  }

  const participantsDialog = (
    <ParticipantsDialog
      event={
        activeEvent
          ? {
              ...activeEvent,
              is_signed_up: signupDraft[activeEvent.id] ?? activeEvent.is_signed_up,
              signup_count: countDraft[activeEvent.id] ?? activeEvent.signup_count,
              my_distances:
                distanceDraft[activeEvent.id] ?? activeEvent.my_distances ?? [],
            }
          : null
      }
      onOpenChange={(open) => {
        if (!open) setActiveEvent(null)
      }}
      onToggleSignup={() => {
        if (activeEvent) toggleSignup(activeEvent)
      }}
      onEditDistances={() => {
        if (activeEvent) openEditDistances(activeEvent)
      }}
      pending={pending && pendingEventId === activeEvent?.id}
      readOnly={readOnly}
      canParticipate={canParticipate}
      canStaffAddParticipants={canManageParticipants}
      onStaffAddParticipant={handleStaffAddParticipant}
      onStaffRemoveParticipant={handleStaffRemoveParticipant}
    />
  )

  const distancePickerDialog = (
    <DistancePickerDialog
      open={distancePicker != null}
      event={distancePicker?.event ?? null}
      mode={distancePicker?.mode ?? 'join'}
      memberName={distancePicker?.member?.name}
      initialDistances={
        distancePicker?.mode === 'edit'
          ? distanceDraft[distancePicker.event.id] ??
            distancePicker.event.my_distances ??
            []
          : distancePicker?.mode === 'staff-add' && distancePicker.member
            ? distancePicker.event.signups.find(
                (signup) => signup.member_id === distancePicker.member?.id,
              )?.distances ?? []
            : []
      }
      pending={pending}
      onOpenChange={(open) => {
        if (!open) setDistancePicker(null)
      }}
      onConfirm={handleDistancePickerConfirm}
    />
  )

  if (contentOnly) {
    return (
      <div className={cn(className)}>
        {scheduleBody}
        {participantsDialog}
        {distancePickerDialog}
      </div>
    )
  }

  return (
    <section className={cn(!embedded && MEMBER_PORTAL_SHELL_CLASS, className)}>
      <div className={MEMBER_PORTAL_CARD_CLASS}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 border-b border-lime-500/15 px-3 py-2.5 text-left sm:px-4"
          onClick={() => setSectionOpen((value) => !value)}
          aria-expanded={sectionOpen}
        >
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-lime-400" />
            <h2 className="text-base font-bold text-lime-50 sm:text-lg">대회 일정</h2>
            {!sectionOpen ? (
              <span className="truncate text-xs text-zinc-500">{collapsedSummary}</span>
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200',
              sectionOpen && 'rotate-180',
            )}
            aria-hidden
          />
        </button>

        {sectionOpen ? scheduleBody : null}
        {participantsDialog}
        {distancePickerDialog}
      </div>
    </section>
  )
}

function patchMemberSignups(
  signups: MarathonEventSignup[],
  memberId: string,
  next: {
    signedUp: boolean
    distances: MarathonDistanceFilter[]
    memberName: string
    signedAt?: string
  },
): MarathonEventSignup[] {
  if (!next.signedUp) {
    return signups.filter((signup) => signup.member_id !== memberId)
  }
  const existing = signups.find((signup) => signup.member_id === memberId)
  if (existing) {
    return signups.map((signup) =>
      signup.member_id === memberId
        ? { ...signup, distances: next.distances }
        : signup,
    )
  }
  return [
    ...signups,
    {
      member_id: memberId,
      member_name: next.memberName,
      signed_at: next.signedAt ?? new Date().toISOString(),
      distances: next.distances,
    },
  ]
}

function DistanceBadges({
  distances,
  emptyLabel,
}: {
  distances: MarathonDistanceFilter[]
  emptyLabel?: string
}) {
  if (distances.length === 0) {
    return emptyLabel ? (
      <span className="text-[10px] text-zinc-500">{emptyLabel}</span>
    ) : null
  }
  return (
    <span className="flex flex-wrap gap-1">
      {distances.map((distance) => (
        <span
          key={distance}
          className="rounded-full border border-sky-500/35 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-100"
        >
          {formatMarathonDistanceLabel(distance)}
        </span>
      ))}
    </span>
  )
}

function ParticipationToggle({
  active,
  pending,
  disabled,
  onToggle,
}: {
  active: boolean
  pending: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={active ? '참여 취소' : '참여하기'}
      disabled={disabled || pending}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className={cn(
        'relative h-8 w-[4.85rem] shrink-0 rounded-full border p-0.5 transition-all duration-300',
        active
          ? 'border-lime-400/70 bg-lime-500/15 shadow-[0_0_14px_rgba(163,230,53,0.38)]'
          : 'border-lime-500/20 bg-black/55',
        (disabled || pending) && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full transition-all duration-300 ease-out',
          active
            ? 'left-0.5 bg-lime-400 shadow-[0_0_10px_rgba(190,242,100,0.75)]'
            : 'left-[calc(50%)] bg-zinc-600/90',
        )}
      />
      <span className="relative z-10 grid h-full grid-cols-2 text-[10px] font-semibold leading-none">
        <span
          className={cn(
            'flex items-center justify-center transition-colors duration-300',
            active ? 'text-black' : 'text-zinc-600',
          )}
        >
          참여
        </span>
        <span
          className={cn(
            'flex items-center justify-center transition-colors duration-300',
            active ? 'text-zinc-500' : 'text-zinc-400',
          )}
        >
          취소
        </span>
      </span>
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-lime-300" />
        </span>
      ) : null}
    </button>
  )
}

function MarathonEventRow({
  event,
  pending,
  pinPending,
  readOnly,
  canParticipate,
  canPin,
  isSignedUp,
  isPinned,
  signupCount,
  myDistances,
  onOpenParticipants,
  onToggleSignup,
  onEditDistances,
  onTogglePin,
}: {
  event: MarathonEventView
  pending: boolean
  pinPending: boolean
  readOnly: boolean
  canParticipate: boolean
  canPin: boolean
  isSignedUp: boolean
  isPinned: boolean
  signupCount: number
  myDistances: MarathonDistanceFilter[]
  onOpenParticipants: () => void
  onToggleSignup: () => void
  onEditDistances: () => void
  onTogglePin: () => void
}) {
  return (
    <div
      className={cn(
        'flex w-full items-start gap-2 rounded-lg border bg-black/35 px-2.5 py-2',
        isPinned
          ? 'border-amber-400/45 bg-amber-500/[0.07] shadow-[0_0_16px_-6px_rgba(251,191,36,0.45)]'
          : 'border-lime-500/15',
      )}
    >
      <button
        type="button"
        onClick={onOpenParticipants}
        className="flex min-w-0 flex-1 items-start gap-2 text-left transition-colors hover:opacity-90"
      >
        <span className="mt-0.5 flex shrink-0 flex-col items-center gap-0.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-lime-500/15 text-xs font-bold text-lime-200">
            {event.weekday_label}
          </span>
          <span className="text-[10px] font-medium tabular-nums leading-none text-zinc-500">
            {event.event_date_label}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {isPinned ? (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-400/45 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                <Pin className="h-3 w-3" />
                고정
              </span>
            ) : null}
            <span className="text-sm font-medium leading-snug text-zinc-100">{event.title}</span>
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                event.days_until === 0
                  ? 'border-lime-400/50 bg-lime-500/20 text-lime-100'
                  : event.days_until > 0
                    ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
                    : 'border-zinc-600 bg-zinc-800/80 text-zinc-400',
              )}
            >
              {event.day_label}
            </span>
            <MarathonEventLabels
              isFeatured={event.is_featured}
              registrationOpen={event.registration_open}
              eventDate={event.event_date}
              registrationEndDate={event.registration_end_date}
              customLabels={event.custom_labels}
            />
          </span>
          {event.location_label || event.region ? (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
              <MapPin className="h-3 w-3 shrink-0" />
              {[event.region, event.location_label].filter(Boolean).join(' · ')}
            </span>
          ) : null}
          {event.notes ? (
            <span className="mt-0.5 block text-[11px] text-zinc-500">{event.notes}</span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {event.registration_href ? (
              <a
                href={event.registration_href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(clickEvent) => clickEvent.stopPropagation()}
                className="inline-flex items-center gap-0.5 rounded-full border border-lime-500/25 px-2 py-0.5 text-[10px] text-lime-200 hover:bg-lime-500/10"
              >
                참가신청
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px]',
                signupCount > 0
                  ? 'border-lime-400/50 bg-lime-500/15 font-medium text-lime-200 shadow-[0_0_10px_rgba(163,230,53,0.25)]'
                  : 'border-zinc-700 text-zinc-400',
              )}
            >
              <Users className="h-3 w-3" />
              {signupCount}명 참여
            </span>
            {isSignedUp && myDistances.length > 0 ? (
              <DistanceBadges distances={myDistances} />
            ) : null}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {canPin ? (
          <button
            type="button"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation()
              onTogglePin()
            }}
            disabled={pinPending}
            title={isPinned ? '상단 고정 해제' : '목록 상단에 고정'}
            aria-label={isPinned ? '상단 고정 해제' : '목록 상단에 고정'}
            aria-pressed={isPinned}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition-colors',
              isPinned
                ? 'border-amber-400/55 bg-amber-500/20 text-amber-100'
                : 'border-zinc-700 bg-black/40 text-zinc-400 hover:border-amber-400/40 hover:text-amber-200',
              pinPending && 'opacity-60',
            )}
          >
            {pinPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pin className={cn('h-3.5 w-3.5', isPinned && 'fill-current')} />
            )}
            {isPinned ? '고정됨' : '고정'}
          </button>
        ) : null}
        {!readOnly ? (
          <>
            <ParticipationToggle
              active={isSignedUp}
              pending={pending}
              disabled={!canParticipate}
              onToggle={onToggleSignup}
            />
            {isSignedUp && canParticipate ? (
              <button
                type="button"
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation()
                  onEditDistances()
                }}
                disabled={pending}
                className="text-[10px] font-medium text-sky-300/90 hover:text-sky-200 disabled:opacity-50"
              >
                종목 변경
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

function ParticipantsDialog({
  event,
  onOpenChange,
  onToggleSignup,
  onEditDistances,
  pending,
  readOnly,
  canParticipate,
  canStaffAddParticipants = false,
  onStaffAddParticipant,
  onStaffRemoveParticipant,
}: {
  event: MarathonEventView | null
  onOpenChange: (open: boolean) => void
  onToggleSignup: () => void
  onEditDistances: () => void
  pending: boolean
  readOnly: boolean
  canParticipate: boolean
  canStaffAddParticipants?: boolean
  onStaffAddParticipant?: (member: MemberPickerOption) => void
  onStaffRemoveParticipant?: (memberId: string, memberName: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [members, setMembers] = useState<MemberPickerOption[] | null>(null)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [query, setQuery] = useState('')

  const eventId = event?.id ?? null
  useEffect(() => {
    setAdding(false)
    setQuery('')
    if (!eventId) {
      setMembers(null)
      setLoadingMembers(false)
    }
  }, [eventId])

  function openAddPicker() {
    setAdding(true)
    setQuery('')
    if (members) return
    setLoadingMembers(true)
    void listAdultRunningMembersForPicker(300)
      .then((rows) => setMembers(rows))
      .catch(() => {
        toast.error('회원 목록을 불러오지 못했습니다.')
        setAdding(false)
      })
      .finally(() => setLoadingMembers(false))
  }

  const filteredMembers = useMemo(() => {
    const rows = members ?? []
    const q = query.trim()
    if (!q) return rows
    return rows.filter(
      (member) =>
        matchKoreanNameSearch(member.name, q) ||
        (member.sport ?? '').toLowerCase().includes(q.toLowerCase()),
    )
  }, [members, query])

  return (
    <Dialog open={event != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950">
        {event ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lime-100">
                {event.title}
                <span className="ml-1.5 text-sm font-normal text-zinc-400">
                  {event.weekday_label} · {event.event_date_label} · {event.day_label}
                </span>
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-left text-zinc-400">
                  <p>
                    {[event.region, event.location_label].filter(Boolean).join(' · ') ||
                      '참가 신청 명단'}
                  </p>
                  <MarathonEventLabels
                    isFeatured={event.is_featured}
                    registrationOpen={event.registration_open}
                    eventDate={event.event_date}
                    registrationEndDate={event.registration_end_date}
                    customLabels={event.custom_labels}
                    size="md"
                  />
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {event.signups.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">
                  아직 참여 신청한 회원이 없습니다.
                </p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {event.signups.map((signup) => (
                    <li
                      key={`${signup.member_id}-${signup.signed_at}`}
                      className="flex items-center justify-between gap-2 rounded-md border border-lime-500/15 bg-black/40 px-3 py-2 text-sm text-zinc-200"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{signup.member_name}</span>
                        <span className="mt-0.5 block">
                          <DistanceBadges
                            distances={signup.distances ?? []}
                            emptyLabel="종목 미선택"
                          />
                        </span>
                      </span>
                      {canStaffAddParticipants && onStaffRemoveParticipant ? (
                        <button
                          type="button"
                          disabled={pending}
                          className="shrink-0 rounded p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                          aria-label={`${signup.member_name} 참여 제거`}
                          onClick={() =>
                            onStaffRemoveParticipant(signup.member_id, signup.member_name)
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {adding && canStaffAddParticipants ? (
                <div className="space-y-2 rounded-md border border-lime-500/20 bg-black/30 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-lime-200">참가자 추가</p>
                    <button
                      type="button"
                      className="text-[11px] text-zinc-500 hover:text-zinc-300"
                      onClick={() => setAdding(false)}
                    >
                      닫기
                    </button>
                  </div>
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="이름 검색"
                    className="h-8 border-zinc-700 bg-black/40 text-xs text-zinc-100"
                    autoFocus
                  />
                  <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-800">
                    {loadingMembers ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        불러오는 중…
                      </div>
                    ) : filteredMembers.length === 0 ? (
                      <p className="py-6 text-center text-sm text-zinc-500">회원이 없습니다.</p>
                    ) : (
                      <ul className="divide-y divide-zinc-800">
                        {filteredMembers.map((member) => {
                          const existing = event.signups.find(
                            (signup) => signup.member_id === member.id,
                          )
                          return (
                            <li key={member.id}>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => onStaffAddParticipant?.(member)}
                                className={cn(
                                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-lime-500/10 disabled:opacity-60',
                                  existing && 'bg-lime-500/5',
                                )}
                              >
                                <span className="min-w-0">
                                  <span className="block font-medium text-zinc-100">
                                    {member.name}
                                  </span>
                                  {member.sport ? (
                                    <span className="block truncate text-[11px] text-zinc-500">
                                      {member.sport}
                                    </span>
                                  ) : null}
                                  {existing ? (
                                    <span className="mt-0.5 block">
                                      <DistanceBadges
                                        distances={existing.distances ?? []}
                                        emptyLabel="종목 미선택"
                                      />
                                    </span>
                                  ) : null}
                                </span>
                                {existing ? (
                                  <span className="shrink-0 rounded-full border border-lime-500/40 px-2 py-0.5 text-[10px] font-medium text-lime-300">
                                    종목변경
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[11px] text-zinc-500">추가</span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canStaffAddParticipants && !adding ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-lime-500/35 text-lime-100"
                    disabled={pending}
                    onClick={openAddPicker}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    참가자 추가
                  </Button>
                ) : null}
                {event.registration_href ? (
                  <Button asChild variant="outline" size="sm" className="border-lime-500/25">
                    <a href={event.registration_href} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      참가신청
                    </a>
                  </Button>
                ) : null}
                {!readOnly ? (
                  <>
                    <ParticipationToggle
                      active={event.is_signed_up}
                      pending={pending}
                      disabled={!canParticipate}
                      onToggle={onToggleSignup}
                    />
                    {event.is_signed_up && canParticipate ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-sky-500/35 text-sky-100"
                        disabled={pending}
                        onClick={onEditDistances}
                      >
                        종목 변경
                        {event.my_distances?.length
                          ? ` · ${formatMarathonDistancesLabel(event.my_distances)}`
                          : ''}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DistancePickerDialog({
  open,
  event,
  mode,
  memberName,
  initialDistances,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  event: MarathonEventView | null
  mode: 'join' | 'edit' | 'staff-add'
  memberName?: string
  initialDistances: MarathonDistanceFilter[]
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (distances: MarathonDistanceFilter[]) => void
}) {
  const options = useMemo(
    () =>
      event
        ? resolveMarathonEventDistanceOptions({
            notes: event.notes,
            title: event.title,
          })
        : MARATHON_DISTANCE_FILTERS.map((item) => item.id),
    [event],
  )
  const [selected, setSelected] = useState<MarathonDistanceFilter[]>([])
  const initialKey = initialDistances.join(',')

  useEffect(() => {
    if (!open) return
    const allowed = new Set(options)
    const seeded = initialKey
      .split(',')
      .filter(Boolean) as MarathonDistanceFilter[]
    const next = seeded.filter((item) => allowed.has(item))
    setSelected(next.length > 0 ? next : options.length === 1 ? [...options] : [])
  }, [open, event?.id, mode, memberName, initialKey, options])

  function toggleDistance(id: MarathonDistanceFilter) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  const title =
    mode === 'edit'
      ? '종목 변경'
      : mode === 'staff-add'
        ? '참가자 종목 선택'
        : '참가 종목 선택'
  const description =
    mode === 'staff-add' && memberName
      ? `${memberName} 님이 뛸 종목을 선택하세요.`
      : mode === 'edit'
        ? '참가할 종목을 다시 선택하세요. 하나 이상 필요합니다.'
        : '참가할 종목을 하나 이상 선택하세요.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950">
        {event ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lime-100">{title}</DialogTitle>
              <DialogDescription className="text-zinc-400">
                {event.title}
                <span className="mt-1 block text-zinc-500">{description}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {options.map((distance) => {
                const active = selected.includes(distance)
                return (
                  <button
                    key={distance}
                    type="button"
                    onClick={() => toggleDistance(distance)}
                    className={cn(
                      'rounded-lg border px-3 py-3 text-sm font-semibold transition-colors',
                      active
                        ? 'border-lime-400/60 bg-lime-500/20 text-lime-50'
                        : 'border-zinc-700 bg-black/40 text-zinc-400 hover:border-lime-500/30 hover:text-zinc-200',
                    )}
                  >
                    {formatMarathonDistanceLabel(distance)}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-zinc-700"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-lime-500 text-black hover:bg-lime-400"
                disabled={pending || selected.length === 0}
                onClick={() => onConfirm(selected)}
              >
                {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {mode === 'edit' ? '변경' : mode === 'staff-add' ? '추가' : '참여'}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
