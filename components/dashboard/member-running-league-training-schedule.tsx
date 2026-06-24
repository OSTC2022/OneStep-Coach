'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { toggleCenterRunningTrainingScheduleSignup } from '@/lib/actions/center-running-training-schedule'
import type { RunningLeagueTrainingScheduleDayView } from '@/lib/running-league/training-schedule'
import {
  buildFullWeekScheduleDays,
  isVotableTrainingScheduleDay,
} from '@/lib/running-league/training-schedule'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  MEMBER_PORTAL_CARD_CLASS,
  MEMBER_PORTAL_SHELL_CLASS,
} from '@/lib/running-league/member-portal-layout'

type MemberRunningLeagueTrainingScheduleProps = {
  days: RunningLeagueTrainingScheduleDayView[]
  tableReady: boolean
  canParticipate: boolean
  readOnly?: boolean
  embedded?: boolean
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

export function MemberRunningLeagueTrainingSchedule({
  days,
  tableReady,
  canParticipate,
  readOnly = false,
  embedded = false,
  className,
}: MemberRunningLeagueTrainingScheduleProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [pendingDayId, setPendingDayId] = useState<string | null>(null)
  const [scheduleDays, setScheduleDays] = useState(days)
  const [activeDay, setActiveDay] = useState<RunningLeagueTrainingScheduleDayView | null>(null)
  const [sectionOpen, setSectionOpen] = useState(false)
  const [signupDraft, setSignupDraft] = useState<Record<string, boolean>>(() => buildSignupDraft(days))

  useEffect(() => {
    setScheduleDays(days)
    setSignupDraft((current) => buildSignupDraft(days, current))
    setActiveDay((current) => {
      if (!current) return current
      return days.find((day) => day.id === current.id) ?? null
    })
  }, [days])

  const fullWeekDays = useMemo(
    () => buildFullWeekScheduleDays(scheduleDays),
    [scheduleDays],
  )
  const visibleDays = useMemo(
    () => fullWeekDays.filter(isVotableDay),
    [fullWeekDays],
  )
  const hasWeekSchedule = fullWeekDays.some(
    (day) =>
      isVotableDay(day) ||
      day.is_hidden ||
      Boolean(day.schedule_date) ||
      Boolean(day.training_summary.trim()),
  )
  const signedUpCount = visibleDays.filter((day) => signupDraft[day.id] ?? day.is_signed_up).length

  function toggleSignup(day: RunningLeagueTrainingScheduleDayView) {
    if (readOnly || !canParticipate) {
      toast.error('로그인 후 참여 신청할 수 있습니다.')
      return
    }

    const previous = signupDraft[day.id] ?? day.is_signed_up
    const optimistic = !previous

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
      toast.success(result.signedUp ? '참여 신청했습니다.' : '참여를 취소했습니다.')
      router.refresh()
    })
  }

  function openParticipants(day: RunningLeagueTrainingScheduleDayView) {
    const latest = scheduleDays.find((item) => item.id === day.id) ?? day
    setActiveDay(latest)
  }

  if (!embedded && !tableReady) {
    return null
  }

  const collapsedSummary =
    visibleDays.length > 0
      ? `${visibleDays.length}일${signedUpCount > 0 ? ` · ${signedUpCount}일 참여` : ''}`
      : tableReady
        ? '등록된 일정 없음'
        : '준비 중'

  return (
    <section
      className={cn(!embedded && MEMBER_PORTAL_SHELL_CLASS, className)}
    >
      <div className={MEMBER_PORTAL_CARD_CLASS}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 border-b border-lime-500/15 px-3 py-2.5 text-left sm:px-4"
          onClick={() => setSectionOpen((value) => !value)}
          aria-expanded={sectionOpen}
        >
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-lime-400" />
            <h2 className="text-base font-bold text-lime-50 sm:text-lg">이번 주 훈련 스케줄</h2>
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

        {sectionOpen ? (
          <div className="space-y-1.5 p-2.5 sm:p-3">
            {!hasWeekSchedule ? (
              <p className="px-2 py-6 text-center text-sm text-zinc-500">
                {tableReady
                  ? '이번 주 등록된 훈련 일정이 없습니다.'
                  : '훈련 스케줄 기능을 준비 중입니다.'}
              </p>
            ) : (
              fullWeekDays.map((day) =>
                isVotableDay(day) ? (
                  <ScheduleDayRow
                    key={day.id}
                    day={day}
                    pending={pending && pendingDayId === day.id}
                    readOnly={readOnly}
                    canParticipate={canParticipate}
                    isSignedUp={signupDraft[day.id] ?? day.is_signed_up}
                    onOpenParticipants={() => openParticipants(day)}
                    onToggleSignup={() => toggleSignup(day)}
                  />
                ) : (
                  <ScheduleRestDayRow key={day.id} day={day} />
                ),
              )
            )}
          </div>
        ) : null}

        <ParticipantsDialog
          day={activeDay}
          isSignedUp={
            activeDay
              ? (signupDraft[activeDay.id] ?? activeDay.is_signed_up)
              : false
          }
          onOpenChange={(open) => {
            if (!open) setActiveDay(null)
          }}
          onToggleSignup={() => {
            if (activeDay) toggleSignup(activeDay)
          }}
          pending={pending}
          readOnly={readOnly}
          canParticipate={canParticipate}
        />
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

function ScheduleDayRow({
  day,
  pending,
  readOnly,
  canParticipate,
  isSignedUp,
  onOpenParticipants,
  onToggleSignup,
}: {
  day: RunningLeagueTrainingScheduleDayView
  pending: boolean
  readOnly: boolean
  canParticipate: boolean
  isSignedUp: boolean
  onOpenParticipants: () => void
  onToggleSignup: () => void
}) {
  return (
    <div className="flex w-full items-start gap-2 rounded-lg border border-lime-500/15 bg-black/35 px-2.5 py-2">
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
            <span className="inline-flex items-center gap-0.5 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
              <Users className="h-3 w-3" />
              {day.signup_count}명 참여
            </span>
          </span>
        </span>
      </button>
      {!readOnly ? (
        <ParticipationToggle
          active={isSignedUp}
          pending={pending}
          disabled={!canParticipate}
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
  readOnly,
  canParticipate,
}: {
  day: RunningLeagueTrainingScheduleDayView | null
  isSignedUp: boolean
  onOpenChange: (open: boolean) => void
  onToggleSignup: () => void
  pending: boolean
  readOnly: boolean
  canParticipate: boolean
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
                <p className="py-4 text-center text-sm text-zinc-500">아직 참여 신청한 회원이 없습니다.</p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {day.signups.map((signup) => (
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
                {day.map_href ? (
                  <Button asChild variant="outline" size="sm" className="border-lime-500/25">
                    <a href={day.map_href} target="_blank" rel="noopener noreferrer">
                      <MapPin className="mr-1 h-3.5 w-3.5" />
                      위치 보기
                    </a>
                  </Button>
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
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
