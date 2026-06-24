'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  MapPin,
  Users,
  Vote,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  saveMemberCenterTrainingScheduleVote,
  toggleCenterRunningTrainingScheduleSignup,
} from '@/lib/actions/center-running-training-schedule'
import type { RunningLeagueTrainingScheduleDayView } from '@/lib/running-league/training-schedule'
import { hasVisibleTrainingSchedule } from '@/lib/running-league/training-schedule'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type MemberRunningLeagueTrainingScheduleProps = {
  headlineTitle?: string | null
  days: RunningLeagueTrainingScheduleDayView[]
  tableReady: boolean
  canParticipate: boolean
  readOnly?: boolean
}

function isVotableDay(day: RunningLeagueTrainingScheduleDayView): boolean {
  return !day.is_hidden && day.training_summary.trim().length > 0
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

function LeagueScheduleHeader({
  headlineTitle,
  showVoteButton,
  onOpenVote,
  subtitle,
}: {
  headlineTitle?: string | null
  showVoteButton: boolean
  onOpenVote: () => void
  subtitle?: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:text-[11px]">
        ONE STEP RUNNING LEAGUE
      </p>
      {showVoteButton ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 border-lime-500/35 bg-lime-500/10 text-xs text-lime-100 hover:bg-lime-500/20 hover:text-lime-50"
          onClick={onOpenVote}
        >
          <Vote className="mr-1.5 h-3.5 w-3.5" />
          주간 훈련 참여 투표
        </Button>
      ) : null}
      {headlineTitle ? (
        <h1 className="text-xl font-bold sm:text-2xl">{headlineTitle}</h1>
      ) : null}
      {subtitle ? <p className="text-xs text-muted-foreground sm:text-sm">{subtitle}</p> : null}
    </div>
  )
}

export function MemberRunningLeagueTrainingSchedule({
  headlineTitle,
  days,
  tableReady,
  canParticipate,
  readOnly = false,
}: MemberRunningLeagueTrainingScheduleProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [votePending, startVoteTransition] = useTransition()
  const [scheduleDays, setScheduleDays] = useState(days)
  const [activeDay, setActiveDay] = useState<RunningLeagueTrainingScheduleDayView | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [voteDialogOpen, setVoteDialogOpen] = useState(false)
  const [signupDraft, setSignupDraft] = useState<Record<string, boolean>>(() => buildSignupDraft(days))

  useEffect(() => {
    setScheduleDays(days)
    setSignupDraft((current) => buildSignupDraft(days, current))
    setActiveDay((current) => {
      if (!current) return current
      return days.find((day) => day.id === current.id) ?? null
    })
  }, [days])

  const votableDays = useMemo(
    () => scheduleDays.filter(isVotableDay),
    [scheduleDays],
  )
  const visibleDays = votableDays
  const previewDays = expanded ? visibleDays : visibleDays.slice(0, 3)
  const hasMore = visibleDays.length > 3
  const hasSchedule = hasVisibleTrainingSchedule(scheduleDays)
  const showVoteButton = Boolean(tableReady && hasSchedule && !readOnly)
  const selectedVoteCount = votableDays.filter((day) => signupDraft[day.id]).length

  function toggleSignup(day: RunningLeagueTrainingScheduleDayView) {
    if (readOnly || !canParticipate) {
      toast.error('로그인 후 참여 신청할 수 있습니다.')
      return
    }

    startTransition(async () => {
      const result = await toggleCenterRunningTrainingScheduleSignup(day.id)
      if (!result.ok) {
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

  function handleSaveVote() {
    if (!canParticipate) {
      toast.error('로그인 후 참여 투표할 수 있습니다.')
      return
    }

    const signedUpDayIds = votableDays
      .filter((day) => signupDraft[day.id])
      .map((day) => day.id)

    startVoteTransition(async () => {
      const result = await saveMemberCenterTrainingScheduleVote(signedUpDayIds)
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success('주간 참여 투표가 저장되었습니다.')
      router.refresh()
    })
  }

  if (!tableReady) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:text-[11px]">
          ONE STEP RUNNING LEAGUE
        </p>
        <h1 className="text-xl font-bold sm:text-2xl">내 러닝 포털</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          러닝 스케줄 DB 설정이 필요합니다. 센터에 문의해주세요.
        </p>
      </div>
    )
  }

  const voteDialog = (
    <ParticipationVoteDialog
      open={voteDialogOpen}
      scheduleTitle={headlineTitle ?? '주간 훈련 스케줄'}
      days={votableDays}
      signupDraft={signupDraft}
      onSignupDraftChange={setSignupDraft}
      selectedCount={selectedVoteCount}
      pending={votePending}
      canParticipate={canParticipate}
      onSave={handleSaveVote}
      onClose={() => setVoteDialogOpen(false)}
    />
  )

  if (!hasSchedule) {
    return (
      <>
        <LeagueScheduleHeader
          headlineTitle={headlineTitle}
          subtitle="이번 주 훈련 스케줄이 곧 공지됩니다."
          showVoteButton={false}
          onOpenVote={() => setVoteDialogOpen(true)}
        />
        {voteDialog}
      </>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-lime-400/35 bg-zinc-950/90 shadow-[0_0_24px_rgba(163,230,53,0.05)]">
      <div className="border-b border-lime-500/15 px-3 py-2.5 sm:px-4">
        <LeagueScheduleHeader
          headlineTitle={headlineTitle}
          showVoteButton={showVoteButton}
          onOpenVote={() => setVoteDialogOpen(true)}
        />
        <div className="mt-2 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-lime-400" />
          <h2 className="text-base font-bold text-lime-50 sm:text-lg">이번 주 훈련 스케줄</h2>
        </div>
      </div>

      <div className="space-y-1.5 p-2.5 sm:p-3">
        {previewDays.map((day) => (
          <ScheduleDayRow
            key={day.id}
            day={day}
            pending={pending}
            readOnly={readOnly}
            canParticipate={canParticipate}
            isSignedUp={signupDraft[day.id] ?? day.is_signed_up}
            onOpenParticipants={() => openParticipants(day)}
            onToggleSignup={() => toggleSignup(day)}
          />
        ))}

        {hasMore ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full text-xs text-zinc-400 hover:text-lime-200"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <>
                <ChevronUp className="mr-1 h-3.5 w-3.5" />
                접기
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-3.5 w-3.5" />
                전체 요일 펼쳐보기 ({visibleDays.length}일)
              </>
            )}
          </Button>
        ) : null}
      </div>

      <ParticipantsDialog
        day={activeDay}
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
      {voteDialog}
    </div>
  )
}

function ParticipationVoteDialog({
  open,
  scheduleTitle,
  days,
  signupDraft,
  onSignupDraftChange,
  selectedCount,
  pending,
  canParticipate,
  onSave,
  onClose,
}: {
  open: boolean
  scheduleTitle: string
  days: RunningLeagueTrainingScheduleDayView[]
  signupDraft: Record<string, boolean>
  onSignupDraftChange: (next: Record<string, boolean>) => void
  selectedCount: number
  pending: boolean
  canParticipate: boolean
  onSave: () => void
  onClose: () => void
}) {
  function toggleDraft(dayId: string, checked: boolean) {
    onSignupDraftChange({
      ...signupDraft,
      [dayId]: checked,
    })
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        mobileSheet
        showCloseButton={false}
        className="max-h-[90dvh] gap-3 overflow-y-auto border-lime-500/25 bg-zinc-950 sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lime-100">주간 훈련 참여 투표</DialogTitle>
          <DialogDescription className="text-left text-zinc-400">
            {scheduleTitle} · 참여할 요일을 선택한 뒤 저장하세요. 바깥을 눌러도 닫히지 않습니다.
          </DialogDescription>
        </DialogHeader>

        {!canParticipate ? (
          <p className="rounded-lg border border-lime-500/15 bg-black/40 px-3 py-4 text-sm text-zinc-400">
            로그인 후 참여 투표할 수 있습니다.
          </p>
        ) : days.length === 0 ? (
          <p className="rounded-lg border border-lime-500/15 bg-black/40 px-3 py-4 text-sm text-zinc-400">
            아직 공지된 훈련 스케줄이 없습니다. 스케줄이 올라오면 이곳에서 참여 요일을 선택할 수 있습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {days.map((day) => {
              const checked = Boolean(signupDraft[day.id])
              return (
                <li key={day.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      checked
                        ? 'border-lime-500/40 bg-lime-500/10'
                        : 'border-lime-500/15 bg-black/35 hover:border-lime-500/30',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggleDraft(day.id, value === true)}
                      className="mt-0.5 border-lime-500/40 data-[state=checked]:border-lime-400 data-[state=checked]:bg-lime-400 data-[state=checked]:text-black"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-lime-500/15 px-1.5 text-xs font-bold text-lime-200">
                          {day.weekday_label}
                        </span>
                        <span className="text-sm font-medium text-zinc-100">{day.training_summary}</span>
                      </span>
                      {day.location_label ? (
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {day.location_label}
                        </span>
                      ) : null}
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
                        <Users className="h-3 w-3" />
                        {day.signup_count}명 참여
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-left text-xs text-zinc-500 sm:mr-auto">
            {days.length > 0 ? `${selectedCount}개 요일 선택됨` : '선택한 요일은 닫았다 열어도 유지됩니다.'}
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 text-zinc-300 hover:text-zinc-100 sm:flex-none"
              disabled={pending}
              onClick={onClose}
            >
              닫기
            </Button>
            <Button
              type="button"
              className="flex-1 bg-lime-500 text-black hover:bg-lime-400 sm:flex-none"
              disabled={pending || !canParticipate || days.length === 0}
              onClick={onSave}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  저장 중…
                </>
              ) : (
                '선택 저장'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <button
      type="button"
      onClick={onOpenParticipants}
      className="flex w-full items-start gap-2 rounded-lg border border-lime-500/15 bg-black/35 px-2.5 py-2 text-left transition-colors hover:border-lime-500/30 hover:bg-black/50"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-lime-500/15 text-xs font-bold text-lime-200">
        {day.weekday_label}
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
            className="inline-flex items-center gap-0.5 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400"
            onClick={(event) => {
              event.stopPropagation()
              onOpenParticipants()
            }}
          >
            <Users className="h-3 w-3" />
            {day.signup_count}명 참여
          </span>
        </span>
      </span>
      <Button
        type="button"
        size="sm"
        variant={isSignedUp ? 'secondary' : 'outline'}
        disabled={pending || readOnly}
        className={cn(
          'h-8 shrink-0 px-2.5 text-[11px]',
          isSignedUp
            ? 'border-lime-500/30 bg-lime-500/15 text-lime-100'
            : 'border-lime-500/25 text-lime-100',
          !canParticipate && 'opacity-60',
        )}
        onClick={(event) => {
          event.stopPropagation()
          onToggleSignup()
        }}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isSignedUp ? '참여 취소' : '참여'}
      </Button>
    </button>
  )
}

function ParticipantsDialog({
  day,
  onOpenChange,
  onToggleSignup,
  pending,
  readOnly,
  canParticipate,
}: {
  day: RunningLeagueTrainingScheduleDayView | null
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

              <div className="flex flex-wrap gap-2 pt-1">
                {day.map_href ? (
                  <Button asChild variant="outline" size="sm" className="border-lime-500/25">
                    <a href={day.map_href} target="_blank" rel="noopener noreferrer">
                      <MapPin className="mr-1 h-3.5 w-3.5" />
                      위치 보기
                    </a>
                  </Button>
                ) : null}
                {!readOnly ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !canParticipate}
                    onClick={onToggleSignup}
                    className={day.is_signed_up ? '' : 'bg-lime-500 text-black hover:bg-lime-400'}
                  >
                    {day.is_signed_up ? '참여 취소' : '이 요일 참여하기'}
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
