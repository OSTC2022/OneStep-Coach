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
  Settings2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  toggleMarathonEventSignup,
  toggleMarathonEventPinned,
  getCenterMarathonScheduleForMember,
  type CenterMarathonScheduleBundle,
} from '@/lib/actions/center-marathon-schedule'
import {
  compareMarathonEventsForDisplay,
  formatMarathonMonthLabel,
  listNearbyMarathonMonthKeys,
  marathonEventMatchesDistanceFilters,
  MARATHON_DISTANCE_FILTERS,
  MARATHON_SCHEDULE_ALL_KEY,
  type MarathonDistanceFilter,
  type MarathonEventView,
} from '@/lib/running-league/marathon-schedule'
import { Button } from '@/components/ui/button'
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
  className,
  onMonthChange,
}: MemberMarathonScheduleProps) {
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
  const [signupDraft, setSignupDraft] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(bundle.events.map((event) => [event.id, event.is_signed_up])),
  )
  const [countDraft, setCountDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(bundle.events.map((event) => [event.id, event.signup_count])),
  )
  const [pinDraft, setPinDraft] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(bundle.events.map((event) => [event.id, event.is_pinned])),
  )

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
    setActiveEvent((current) => {
      if (!current) return current
      return bundle.events.find((event) => event.id === current.id) ?? null
    })
  }, [bundle])

  const filteredEvents = useMemo(() => {
    const list = events.filter((event) => {
      if (!marathonEventMatchesDistanceFilters(event, distanceFilters)) return false
      if (mySignupsOnly) {
        return signupDraft[event.id] ?? event.is_signed_up
      }
      return true
    })
    return [...list]
      .map((event) => ({
        ...event,
        is_pinned: pinDraft[event.id] ?? event.is_pinned,
      }))
      .sort(compareMarathonEventsForDisplay)
  }, [events, distanceFilters, mySignupsOnly, signupDraft, pinDraft])

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

    const previous = signupDraft[event.id] ?? event.is_signed_up
    const previousCount = countDraft[event.id] ?? event.signup_count
    const optimistic = !previous

    setSignupDraft((current) => ({ ...current, [event.id]: optimistic }))
    setCountDraft((current) => ({
      ...current,
      [event.id]: Math.max(0, previousCount + (optimistic ? 1 : -1)),
    }))
    setPendingEventId(event.id)

    startTransition(async () => {
      const result = await toggleMarathonEventSignup(event.id)
      setPendingEventId(null)

      if (!result.ok) {
        setSignupDraft((current) => ({ ...current, [event.id]: previous }))
        setCountDraft((current) => ({ ...current, [event.id]: previousCount }))
        toast.error(result.error)
        return
      }

      setSignupDraft((current) => ({ ...current, [event.id]: result.signedUp }))
      setCountDraft((current) => ({ ...current, [event.id]: result.signupCount }))
      setEvents((current) =>
        current.map((row) =>
          row.id === event.id
            ? {
                ...row,
                is_signed_up: result.signedUp,
                signup_count: result.signupCount,
              }
            : row,
        ),
      )
      toast.success(result.signedUp ? '참여 신청했습니다.' : '참여를 취소했습니다.')
    })
  }

  if (!embedded && !tableReady) {
    return null
  }

  const collapsedSummary =
    filteredEvents.length > 0
      ? `${filteredEvents.length}개 대회${signedUpCount > 0 ? ` · ${signedUpCount}개 참여` : ''}`
      : tableReady
        ? mySignupsOnly
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
          {mySignupsOnly
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
            onOpenParticipants={() => setActiveEvent(event)}
            onToggleSignup={() => toggleSignup(event)}
            onTogglePin={() => togglePin(event)}
          />
        ))
      )}
    </div>
  )

  const participantsDialog = (
    <ParticipantsDialog
      event={
        activeEvent
          ? {
              ...activeEvent,
              is_signed_up: signupDraft[activeEvent.id] ?? activeEvent.is_signed_up,
              signup_count: countDraft[activeEvent.id] ?? activeEvent.signup_count,
            }
          : null
      }
      onOpenChange={(open) => {
        if (!open) setActiveEvent(null)
      }}
      onToggleSignup={() => {
        if (activeEvent) toggleSignup(activeEvent)
      }}
      pending={pending && pendingEventId === activeEvent?.id}
      readOnly={readOnly}
      canParticipate={canParticipate}
    />
  )

  if (contentOnly) {
    return (
      <div className={cn(className)}>
        {scheduleBody}
        {participantsDialog}
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
      </div>
    </section>
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
  onOpenParticipants,
  onToggleSignup,
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
  onOpenParticipants: () => void
  onToggleSignup: () => void
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
            <span className="inline-flex items-center gap-0.5 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
              <Users className="h-3 w-3" />
              {signupCount}명 참여
            </span>
          </span>
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {canPin ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
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
          <ParticipationToggle
            active={isSignedUp}
            pending={pending}
            disabled={!canParticipate}
            onToggle={onToggleSignup}
          />
        ) : null}
      </div>
    </div>
  )
}

function ParticipantsDialog({
  event,
  onOpenChange,
  onToggleSignup,
  pending,
  readOnly,
  canParticipate,
}: {
  event: MarathonEventView | null
  onOpenChange: (open: boolean) => void
  onToggleSignup: () => void
  pending: boolean
  readOnly: boolean
  canParticipate: boolean
}) {
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
                      className="rounded-md border border-lime-500/15 bg-black/40 px-3 py-2 text-sm text-zinc-200"
                    >
                      {signup.member_name}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {event.registration_href ? (
                  <Button asChild variant="outline" size="sm" className="border-lime-500/25">
                    <a href={event.registration_href} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      참가신청
                    </a>
                  </Button>
                ) : null}
                {!readOnly ? (
                  <ParticipationToggle
                    active={event.is_signed_up}
                    pending={pending}
                    disabled={!canParticipate}
                    onToggle={onToggleSignup}
                  />
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
