'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  listMembersForTrainingScheduleStaffSignup,
  staffAddCenterRunningTrainingScheduleSignup,
  staffRemoveCenterRunningTrainingScheduleSignup,
  toggleCenterRunningTrainingScheduleSignup,
} from '@/lib/actions/center-running-training-schedule'
import type { MemberPickerOption } from '@/lib/actions/members'
import type {
  RunningLeagueTrainingScheduleDayView,
  RunningLeagueTrainingScheduleSignup,
} from '@/lib/running-league/training-schedule'
import {
  buildFullWeekScheduleDays,
  isVotableTrainingScheduleDay,
} from '@/lib/running-league/training-schedule'
import {
  isTrainingScheduleSignupClosed,
  trainingScheduleSignupClosedMessage,
} from '@/lib/running-league/training-schedule-signup-deadline'
import { parseTrainingScheduleDayId } from '@/lib/training-schedule-audience'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  MEMBER_PORTAL_CARD_CLASS,
  MEMBER_PORTAL_SHELL_CLASS,
} from '@/lib/running-league/member-portal-layout'

/** 렌더마다 새 [] 만들지 않도록 — useEffect 의존성 루프 방지 */
export const EMPTY_SCHEDULE_DAYS: RunningLeagueTrainingScheduleDayView[] = []

type MemberRunningLeagueTrainingScheduleProps = {
  days?: RunningLeagueTrainingScheduleDayView[]
  previousWeekDays?: RunningLeagueTrainingScheduleDayView[]
  /** 다음 주 미리보기 */
  nextWeekDays?: RunningLeagueTrainingScheduleDayView[]
  tableReady: boolean
  canParticipate: boolean
  readOnly?: boolean
  /** 마감 후 관리자·강사 대리 참여 (회원 선택) */
  canStaffProxySignup?: boolean
  embedded?: boolean
  /** 카드 헤더 없이 본문만 (툴바 팝업용) */
  contentOnly?: boolean
  title?: string
  className?: string
}

function isVotableDay(day: RunningLeagueTrainingScheduleDayView): boolean {
  return isVotableTrainingScheduleDay(day)
}

function buildSignupDraft(
  days: RunningLeagueTrainingScheduleDayView[],
  previous: Record<string, boolean> = {},
): Record<string, boolean> {
  const next = { ...previous }
  for (const day of days) {
    if (!isVotableDay(day)) continue
    if (!(day.id in next)) {
      next[day.id] = day.is_signed_up
    }
  }
  return next
}

function daySignupClosed(day: RunningLeagueTrainingScheduleDayView): boolean {
  return isTrainingScheduleSignupClosed({
    weekday: day.weekday,
    scheduleDate: day.schedule_date,
  })
}

export function MemberRunningLeagueTrainingSchedule({
  days = EMPTY_SCHEDULE_DAYS,
  previousWeekDays = EMPTY_SCHEDULE_DAYS,
  nextWeekDays = EMPTY_SCHEDULE_DAYS,
  tableReady,
  canParticipate,
  readOnly = false,
  canStaffProxySignup = false,
  embedded = false,
  contentOnly = false,
  title = '훈련 일정',
  className,
}: MemberRunningLeagueTrainingScheduleProps) {
  const [pending, startTransition] = useTransition()
  const [pendingDayId, setPendingDayId] = useState<string | null>(null)
  const [scheduleDays, setScheduleDays] = useState(days)
  const [pastScheduleDays, setPastScheduleDays] = useState(previousWeekDays)
  const [upcomingScheduleDays, setUpcomingScheduleDays] = useState(nextWeekDays)
  /** 한 번에 한 주만 펼침 */
  const [openWeek, setOpenWeek] = useState<'past' | 'current' | 'next'>('current')
  const [activeDay, setActiveDay] = useState<RunningLeagueTrainingScheduleDayView | null>(null)
  const [sectionOpen, setSectionOpen] = useState(contentOnly)
  const [signupDraft, setSignupDraft] = useState<Record<string, boolean>>(() =>
    buildSignupDraft([...days, ...previousWeekDays, ...nextWeekDays]),
  )
  const [proxyDay, setProxyDay] = useState<RunningLeagueTrainingScheduleDayView | null>(null)
  const [proxyMembers, setProxyMembers] = useState<MemberPickerOption[] | null>(null)
  const [proxyQuery, setProxyQuery] = useState('')
  const [proxyLoading, setProxyLoading] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{
    day: RunningLeagueTrainingScheduleDayView
    signup: RunningLeagueTrainingScheduleSignup
  } | null>(null)

  useEffect(() => {
    setScheduleDays(days)
    setPastScheduleDays(previousWeekDays)
    setUpcomingScheduleDays(nextWeekDays)
    setSignupDraft((current) =>
      buildSignupDraft([...days, ...previousWeekDays, ...nextWeekDays], current),
    )
    setActiveDay((current) => {
      if (!current) return current
      const next =
        days.find((day) => day.id === current.id) ??
        previousWeekDays.find((day) => day.id === current.id) ??
        nextWeekDays.find((day) => day.id === current.id) ??
        null
      // 같은 참조면 스킵 — Dialog 열림 중 불필요 setState로 루프 방지
      return next === current ? current : next
    })
    setOpenWeek((current) => {
      if (current === 'next' && nextWeekDays.length === 0) return 'current'
      if (current === 'past' && previousWeekDays.length === 0) return 'current'
      return current
    })
  }, [days, previousWeekDays, nextWeekDays])

  const fullWeekDays = useMemo(
    () => buildFullWeekScheduleDays(scheduleDays),
    [scheduleDays],
  )
  const fullPastWeekDays = useMemo(
    () => buildFullWeekScheduleDays(pastScheduleDays),
    [pastScheduleDays],
  )
  const fullNextWeekDays = useMemo(
    () => buildFullWeekScheduleDays(upcomingScheduleDays),
    [upcomingScheduleDays],
  )
  const visibleDays = useMemo(
    () => fullWeekDays.filter(isVotableDay),
    [fullWeekDays],
  )
  const hasPastWeekSchedule = fullPastWeekDays.some(
    (day) =>
      isVotableDay(day) ||
      day.is_hidden ||
      Boolean(day.schedule_date) ||
      Boolean(day.training_summary.trim()),
  )
  const hasNextWeekSchedule = fullNextWeekDays.some(
    (day) =>
      isVotableDay(day) ||
      day.is_hidden ||
      Boolean(day.schedule_date) ||
      Boolean(day.training_summary.trim()),
  )
  const signedUpCount = visibleDays.filter((day) => signupDraft[day.id] ?? day.is_signed_up).length

  const filteredProxyMembers = useMemo(() => {
    if (!proxyMembers) return []
    const q = proxyQuery.trim().toLowerCase()
    if (!q) return proxyMembers
    return proxyMembers.filter((member) => {
      const name = member.name.toLowerCase()
      const sport = (member.sport ?? '').toLowerCase()
      return name.includes(q) || sport.includes(q)
    })
  }, [proxyMembers, proxyQuery])

  function patchDaySignup(
    dayId: string,
    patch: {
      signup_count?: number
      signups?: RunningLeagueTrainingScheduleDayView['signups']
      is_signed_up?: boolean
    },
  ) {
    const apply = (list: RunningLeagueTrainingScheduleDayView[]) =>
      list.map((day) => (day.id === dayId ? { ...day, ...patch } : day))

    setScheduleDays((current) => apply(current))
    setPastScheduleDays((current) => apply(current))
    setUpcomingScheduleDays((current) => apply(current))
    setActiveDay((current) => (current?.id === dayId ? { ...current, ...patch } : current))
    setProxyDay((current) => (current?.id === dayId ? { ...current, ...patch } : current))
  }

  function openStaffProxyPicker(day: RunningLeagueTrainingScheduleDayView) {
    setProxyDay(day)
    setProxyQuery('')
    setProxyLoading(true)
    setProxyMembers(null)

    const audience =
      parseTrainingScheduleDayId(day.id)?.audience ?? 'adult_running'

    void listMembersForTrainingScheduleStaffSignup(audience)
      .then((rows) => {
        setProxyMembers(rows)
      })
      .catch(() => {
        toast.error('회원 목록을 불러오지 못했습니다.')
        setProxyDay(null)
      })
      .finally(() => setProxyLoading(false))
  }

  function handleParticipate(day: RunningLeagueTrainingScheduleDayView) {
    const closed = daySignupClosed(day)
    const isSignedUp = signupDraft[day.id] ?? day.is_signed_up
    if (isSignedUp) return

    // 마감 후: 관리자·강사만 회원 선택 참여
    if (closed) {
      if (canStaffProxySignup) {
        openStaffProxyPicker(day)
        return
      }
      toast.error(trainingScheduleSignupClosedMessage(day.weekday))
      return
    }

    // 마감 전: 일반 회원 본인 신청
    if (readOnly || !canParticipate) {
      toast.error('로그인 후 참여 신청할 수 있습니다.')
      return
    }

    runSelfToggle(day, true)
  }

  function handleCancel(day: RunningLeagueTrainingScheduleDayView) {
    const isSignedUp = signupDraft[day.id] ?? day.is_signed_up
    if (!isSignedUp) {
      toast.error('참여 신청된 일정이 아닙니다.')
      return
    }

    // 취소는 마감과 무관하게 본인 참여만 해제
    if (readOnly || !canParticipate) {
      toast.error('로그인 후 참여를 취소할 수 있습니다.')
      return
    }

    runSelfToggle(day, false)
  }

  function runSelfToggle(
    day: RunningLeagueTrainingScheduleDayView,
    expectSignup: boolean,
  ) {
    const previous = signupDraft[day.id] ?? day.is_signed_up
    if (previous === expectSignup) return

    const optimistic = expectSignup
    setSignupDraft((current) => ({
      ...current,
      [day.id]: optimistic,
    }))
    setPendingDayId(day.id)

    startTransition(async () => {
      const result = await toggleCenterRunningTrainingScheduleSignup(day.id)
      setPendingDayId(null)

      if (!result.ok) {
        setSignupDraft((current) => ({
          ...current,
          [day.id]: previous,
        }))
        toast.error(result.error)
        return
      }

      setSignupDraft((current) => ({
        ...current,
        [day.id]: result.signedUp,
      }))
      patchDaySignup(day.id, { signup_count: result.signupCount })
      toast.success(result.signedUp ? '참여 신청했습니다.' : '참여를 취소했습니다.')
    })
  }

  function handleToggleSignup(day: RunningLeagueTrainingScheduleDayView) {
    const isSignedUp = signupDraft[day.id] ?? day.is_signed_up
    if (isSignedUp) {
      handleCancel(day)
      return
    }
    handleParticipate(day)
  }

  function confirmStaffRemoveSignup() {
    const target = removeTarget
    if (!target || pending) return
    const { day, signup } = target
    setPendingDayId(day.id)

    startTransition(async () => {
      const result = await staffRemoveCenterRunningTrainingScheduleSignup(
        day.id,
        signup.member_id,
      )
      setPendingDayId(null)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      const nextSignups = day.signups.filter(
        (item) => item.member_id !== signup.member_id,
      )
      patchDaySignup(day.id, {
        signup_count: result.signupCount,
        signups: nextSignups,
      })

      toast.success(`${signup.member_name} 님 참여를 취소했습니다.`)
      setRemoveTarget(null)
    })
  }

  function pickProxyMember(member: MemberPickerOption) {
    if (!proxyDay) return
    const day = proxyDay
    setPendingDayId(day.id)

    startTransition(async () => {
      const result = await staffAddCenterRunningTrainingScheduleSignup(day.id, member.id)
      setPendingDayId(null)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      const already = day.signups.some((signup) => signup.member_id === member.id)
      const nextSignups = already
        ? day.signups
        : [...day.signups, result.signup]

      patchDaySignup(day.id, {
        signup_count: result.signupCount,
        signups: nextSignups,
      })

      toast.success(
        result.alreadySignedUp
          ? `${member.name} 님은 이미 참여 중입니다.`
          : `${member.name} 님을 참여 처리했습니다.`,
      )
      setProxyDay(null)
    })
  }

  function renderWeekRows(
    weekDays: RunningLeagueTrainingScheduleDayView[],
    options: { emptyMessage: string; participate: boolean },
  ) {
    const hasSchedule = weekDays.some(
      (day) =>
        isVotableDay(day) ||
        day.is_hidden ||
        Boolean(day.schedule_date) ||
        Boolean(day.training_summary.trim()),
    )
    if (!hasSchedule) {
      return (
        <p className="px-2 py-6 text-center text-sm text-zinc-500">{options.emptyMessage}</p>
      )
    }
    return weekDays.map((day) =>
      isVotableDay(day) ? (
        <ScheduleDayRow
          key={day.id}
          day={day}
          pending={pending && pendingDayId === day.id}
          showActions={
            options.participate && (!readOnly || canStaffProxySignup)
          }
          canSelfSignup={canParticipate && options.participate}
          canStaffProxySignup={canStaffProxySignup && options.participate}
          isSignedUp={signupDraft[day.id] ?? day.is_signed_up}
          signupClosed={daySignupClosed(day)}
          onOpenParticipants={() => openParticipants(day)}
          onToggleSignup={() => handleToggleSignup(day)}
        />
      ) : (
        <ScheduleRestDayRow key={day.id} day={day} />
      ),
    )
  }

  function openParticipants(day: RunningLeagueTrainingScheduleDayView) {
    const latest =
      scheduleDays.find((item) => item.id === day.id) ??
      pastScheduleDays.find((item) => item.id === day.id) ??
      upcomingScheduleDays.find((item) => item.id === day.id) ??
      day
    setActiveDay(latest)
  }

  if (!embedded && !contentOnly && !tableReady) {
    return null
  }

  const collapsedSummary =
    visibleDays.length > 0
      ? `${visibleDays.length}일${signedUpCount > 0 ? ` · ${signedUpCount}일 참여` : ''}`
      : tableReady
        ? '등록된 일정 없음'
        : '준비 중'

  function weekTabButton(week: 'past' | 'current' | 'next', label: string) {
    const isOpen = openWeek === week
    return (
      <button
        type="button"
        onClick={() => setOpenWeek((current) => (current === week ? current : week))}
        className={cn(
          'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-center text-xs font-medium transition-colors',
          isOpen
            ? 'bg-lime-500/20 text-lime-100 ring-1 ring-inset ring-lime-500/40'
            : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200',
        )}
      >
        {label}
      </button>
    )
  }

  const scheduleBody = (
    <div className={cn(contentOnly ? 'space-y-2' : 'space-y-2 p-2.5 sm:p-3')}>
      <div className="flex items-center gap-0.5 rounded-lg border border-zinc-700/70 bg-zinc-950/50 p-0.5">
        {hasPastWeekSchedule ? weekTabButton('past', '지난 주') : null}
        {weekTabButton('current', '이번 주')}
        {hasNextWeekSchedule ? weekTabButton('next', '다음 주') : null}
      </div>

      {openWeek === 'past' && hasPastWeekSchedule ? (
        <div className="space-y-1.5 rounded-md border border-dashed border-zinc-700/70 bg-zinc-950/40 p-1.5">
          {renderWeekRows(fullPastWeekDays, {
            emptyMessage: '지난 주 등록된 훈련 일정이 없습니다.',
            participate: false,
          })}
        </div>
      ) : null}

      {openWeek === 'current' ? (
        <div className="space-y-1.5">
          {renderWeekRows(fullWeekDays, {
            emptyMessage: tableReady
              ? '이번 주 등록된 훈련 일정이 없습니다.'
              : '훈련 스케줄 기능을 준비 중입니다.',
            participate: true,
          })}
        </div>
      ) : null}

      {openWeek === 'next' && hasNextWeekSchedule ? (
        <div className="space-y-1.5 rounded-md border border-lime-500/20 bg-lime-500/5 p-1.5">
          {renderWeekRows(fullNextWeekDays, {
            emptyMessage: '다음 주 등록된 훈련 일정이 없습니다.',
            participate: true,
          })}
        </div>
      ) : null}
    </div>
  )

  const dialogs = (
    <>
      <ParticipantsDialog
        day={activeDay}
        isSignedUp={
          activeDay ? (signupDraft[activeDay.id] ?? activeDay.is_signed_up) : false
        }
        onOpenChange={(open) => {
          if (!open) setActiveDay(null)
        }}
        onToggleSignup={() => {
          if (activeDay) handleToggleSignup(activeDay)
        }}
        pending={pending && pendingDayId === activeDay?.id}
        showActions={!readOnly || canStaffProxySignup}
        canSelfSignup={canParticipate}
        canStaffProxySignup={canStaffProxySignup}
        canStaffRemoveSignup={canStaffProxySignup}
        signupClosed={activeDay ? daySignupClosed(activeDay) : false}
        onRequestRemoveSignup={(signup) => {
          if (!activeDay) return
          setRemoveTarget({ day: activeDay, signup })
        }}
      />

      <AlertDialog
        open={removeTarget != null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
      >
        <AlertDialogContent className="border-lime-500/25 bg-zinc-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lime-100">정말 지우겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {removeTarget
                ? `${removeTarget.signup.member_name} 님의 참여를 취소합니다.`
                : '선택한 회원의 참여를 취소합니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={pending}
              className="border-zinc-700 bg-zinc-900 text-zinc-200"
            >
              아니요
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={pending}
              className="bg-lime-500 text-black hover:bg-lime-400"
              onClick={confirmStaffRemoveSignup}
            >
              {pending ? '처리 중…' : '예'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={proxyDay != null}
        onOpenChange={(open) => {
          if (!open) setProxyDay(null)
        }}
      >
        <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950">
          {proxyDay ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-lime-100">회원 선택 · 참여 등록</DialogTitle>
                <DialogDescription className="text-left text-zinc-400">
                  {proxyDay.weekday_label}요일
                  {proxyDay.schedule_date_label
                    ? ` ${proxyDay.schedule_date_label}`
                    : ''}{' '}
                  · {proxyDay.training_summary}
                </DialogDescription>
              </DialogHeader>

              <Input
                value={proxyQuery}
                onChange={(event) => setProxyQuery(event.target.value)}
                placeholder="이름 검색"
                className="border-zinc-700 bg-black/40 text-zinc-100"
                autoFocus
              />

              <div className="max-h-64 overflow-y-auto rounded-md border border-zinc-800">
                {proxyLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    불러오는 중…
                  </div>
                ) : filteredProxyMembers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">회원이 없습니다.</p>
                ) : (
                  <ul className="divide-y divide-zinc-800">
                    {filteredProxyMembers.map((member) => {
                      const already = proxyDay.signups.some(
                        (signup) => signup.member_id === member.id,
                      )
                      return (
                        <li key={member.id}>
                          <button
                            type="button"
                            disabled={pending && pendingDayId === proxyDay.id}
                            onClick={() => pickProxyMember(member)}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-lime-500/10',
                              already && 'bg-lime-500/5',
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
                            </span>
                            {already ? (
                              <span className="shrink-0 rounded-full border border-lime-500/40 px-2 py-0.5 text-[10px] font-medium text-lime-300">
                                참여중
                              </span>
                            ) : (
                              <span className="shrink-0 text-[11px] text-zinc-500">선택</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )

  if (contentOnly) {
    return (
      <div className={cn(className)}>
        {scheduleBody}
        {dialogs}
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
            <h2 className="text-base font-bold text-lime-50 sm:text-lg">{title}</h2>
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
        {dialogs}
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

function ScheduleRestDayRow({ day }: { day: RunningLeagueTrainingScheduleDayView }) {
  const label = day.is_hidden ? '휴강' : '일정 없음'

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-800/80 bg-black/20 px-2.5 py-2">
      <span className="flex shrink-0 flex-col items-center gap-0.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800/80 text-xs font-bold text-zinc-500">
          {day.weekday_label}
        </span>
        {day.schedule_date_label ? (
          <span className="text-[10px] font-medium tabular-nums leading-none text-zinc-600">
            {day.schedule_date_label}
          </span>
        ) : null}
      </span>
      <span className="text-sm text-zinc-500">{label}</span>
    </div>
  )
}

function toggleDisabled({
  isSignedUp,
  canSelfSignup,
  canStaffProxySignup,
  signupClosed,
}: {
  isSignedUp: boolean
  canSelfSignup: boolean
  canStaffProxySignup: boolean
  signupClosed: boolean
}): boolean {
  if (isSignedUp) return !canSelfSignup
  return !(
    (canSelfSignup && !signupClosed) ||
    (canStaffProxySignup && signupClosed)
  )
}

function ScheduleDayRow({
  day,
  pending,
  showActions,
  canSelfSignup,
  canStaffProxySignup,
  isSignedUp,
  signupClosed,
  onOpenParticipants,
  onToggleSignup,
}: {
  day: RunningLeagueTrainingScheduleDayView
  pending: boolean
  showActions: boolean
  canSelfSignup: boolean
  canStaffProxySignup: boolean
  isSignedUp: boolean
  signupClosed: boolean
  onOpenParticipants: () => void
  onToggleSignup: () => void
}) {
  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-lime-500/15 bg-black/35 px-2.5 py-2">
      <button
        type="button"
        onClick={onOpenParticipants}
        className="flex min-w-0 flex-1 items-start gap-2 text-left transition-colors hover:opacity-90"
      >
        <span className="mt-0.5 flex shrink-0 flex-col items-center gap-0.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-lime-500/15 text-xs font-bold text-lime-200">
            {day.weekday_label}
          </span>
          {day.schedule_date_label ? (
            <span className="text-[10px] font-medium tabular-nums leading-none text-zinc-500">
              {day.schedule_date_label}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug text-zinc-100">
            {day.training_summary}
          </span>
          {day.location_label ? (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
              <MapPin className="h-3 w-3 shrink-0" />
              {day.location_label}
            </span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {day.map_href ? (
              <a
                href={day.map_href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-0.5 rounded-full border border-lime-500/25 px-2 py-0.5 text-[10px] text-lime-200 hover:bg-lime-500/10"
              >
                위치 보기
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px]',
                day.signup_count > 0
                  ? 'border-lime-400/50 bg-lime-500/15 font-medium text-lime-200 shadow-[0_0_10px_rgba(163,230,53,0.25)]'
                  : 'border-zinc-700 text-zinc-400',
              )}
            >
              <Users className="h-3 w-3" />
              {day.signup_count}명 참여
            </span>
            {isSignedUp ? (
              <span className="inline-flex items-center rounded-full border border-lime-500/35 bg-lime-500/10 px-2 py-0.5 text-[10px] font-medium text-lime-200">
                내 참여
              </span>
            ) : null}
          </span>
        </span>
      </button>
      {showActions ? (
        <ParticipationToggle
          active={isSignedUp}
          pending={pending}
          disabled={toggleDisabled({
            isSignedUp,
            canSelfSignup,
            canStaffProxySignup,
            signupClosed,
          })}
          onToggle={onToggleSignup}
        />
      ) : null}
    </div>
  )
}

function ParticipantsDialog({
  day,
  isSignedUp,
  onOpenChange,
  onToggleSignup,
  pending,
  showActions,
  canSelfSignup,
  canStaffProxySignup,
  canStaffRemoveSignup,
  signupClosed,
  onRequestRemoveSignup,
}: {
  day: RunningLeagueTrainingScheduleDayView | null
  isSignedUp: boolean
  onOpenChange: (open: boolean) => void
  onToggleSignup: () => void
  pending: boolean
  showActions: boolean
  canSelfSignup: boolean
  canStaffProxySignup: boolean
  canStaffRemoveSignup: boolean
  signupClosed: boolean
  onRequestRemoveSignup: (signup: RunningLeagueTrainingScheduleSignup) => void
}) {
  return (
    <Dialog open={day != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950">
        {day ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lime-100">
                {day.weekday_label}요일 참여 명단
                {day.schedule_date_label ? (
                  <span className="ml-1.5 text-sm font-normal text-zinc-400">
                    {day.schedule_date_label}
                  </span>
                ) : null}
              </DialogTitle>
              <DialogDescription className="text-left text-zinc-400">
                {day.training_summary}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {day.signups.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">
                  아직 참여 신청한 회원이 없습니다.
                </p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {day.signups.map((signup) => (
                    <li
                      key={`${signup.member_id}-${signup.signed_at}`}
                      className="flex items-center gap-2 rounded-md border border-lime-500/15 bg-black/40 px-3 py-2 text-sm text-zinc-200"
                    >
                      <span className="min-w-0 flex-1 truncate">{signup.member_name}</span>
                      {canStaffRemoveSignup ? (
                        <button
                          type="button"
                          aria-label={`${signup.member_name} 참여 취소`}
                          disabled={pending}
                          onClick={() => onRequestRemoveSignup(signup)}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {day.map_href ? (
                  <Button asChild variant="outline" size="sm" className="border-lime-500/25">
                    <a href={day.map_href} target="_blank" rel="noopener noreferrer">
                      <MapPin className="mr-1 h-3.5 w-3.5" />
                      위치 보기
                    </a>
                  </Button>
                ) : null}
                {showActions ? (
                  <ParticipationToggle
                    active={isSignedUp}
                    pending={pending}
                    disabled={toggleDisabled({
                      isSignedUp,
                      canSelfSignup,
                      canStaffProxySignup,
                      signupClosed,
                    })}
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
