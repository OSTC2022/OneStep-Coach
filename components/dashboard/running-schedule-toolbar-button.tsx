'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { MemberRunningLeagueTrainingSchedule } from '@/components/dashboard/member-running-league-training-schedule'
import { getCenterRunningTrainingScheduleForStaff } from '@/lib/actions/center-running-training-schedule'
import type { CenterRunningTrainingScheduleBundle } from '@/lib/actions/center-running-training-schedule'
import { YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL } from '@/lib/youth-athletics-class'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const EMPTY_SCHEDULE_DAYS: NonNullable<
  CenterRunningTrainingScheduleBundle['days']
> = []

type ScheduleCategory = 'adult' | 'youth'

type RunningScheduleToolbarButtonProps = {
  initialBundle?: CenterRunningTrainingScheduleBundle | null
  initialYouthBundle?: CenterRunningTrainingScheduleBundle | null
  triggerClassName?: string
}

function countVisibleDays(bundle: CenterRunningTrainingScheduleBundle | null) {
  const days = bundle?.days ?? EMPTY_SCHEDULE_DAYS
  return days.filter(
    (day) =>
      !day.is_hidden &&
      (Boolean(day.schedule_date) || Boolean(day.training_summary?.trim())),
  ).length
}

export function RunningScheduleToolbarButton({
  initialBundle = null,
  initialYouthBundle = null,
  triggerClassName,
}: RunningScheduleToolbarButtonProps) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<ScheduleCategory>('adult')
  const [adultBundle, setAdultBundle] =
    useState<CenterRunningTrainingScheduleBundle | null>(initialBundle)
  const [youthBundle, setYouthBundle] =
    useState<CenterRunningTrainingScheduleBundle | null>(initialYouthBundle)

  useEffect(() => {
    setAdultBundle(initialBundle)
  }, [initialBundle])

  useEffect(() => {
    setYouthBundle(initialYouthBundle)
  }, [initialYouthBundle])

  const dayCount = useMemo(
    () => countVisibleDays(adultBundle) + countVisibleDays(youthBundle),
    [adultBundle, youthBundle],
  )

  const activeBundle = category === 'adult' ? adultBundle : youthBundle

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    void Promise.all([
      getCenterRunningTrainingScheduleForStaff('adult_running'),
      getCenterRunningTrainingScheduleForStaff('youth_athletics'),
    ])
      .then(([adult, youth]) => {
        setAdultBundle(adult)
        setYouthBundle(youth)
      })
      .catch(() => {
        /* keep previous */
      })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-8 text-xs', triggerClassName)}
        >
          <CalendarDays className="mr-1 h-3.5 w-3.5" aria-hidden />
          러닝 스케줄
          {dayCount > 0 ? (
            <span className="ml-1 rounded-sm bg-muted px-1 text-[10px] tabular-nums text-foreground">
              {dayCount}일
            </span>
          ) : null}
        </Button>
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[min(90vh,820px)] w-[min(100vw-1.5rem,480px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        opaqueBackdrop
      >
        <DialogHeader className="shrink-0 border-b border-border/70 bg-muted/25 px-3 py-3 text-left sm:px-4">
          <DialogTitle className="sr-only">
            {category === 'adult'
              ? '러닝 스케줄'
              : `${YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL} 스케줄`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {category === 'adult'
              ? '성인 러닝 훈련 일정'
              : `${YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL} 훈련 일정`}
          </DialogDescription>

          <div
            className="flex w-full items-center gap-1 rounded-lg border border-border/70 bg-background/60 p-1"
            role="tablist"
            aria-label="스케줄 카테고리"
          >
            <button
              type="button"
              role="tab"
              aria-selected={category === 'adult'}
              onClick={() => setCategory('adult')}
              className={cn(
                'min-w-0 flex-1 truncate rounded-md px-3 py-2.5 text-center text-sm font-semibold transition-colors',
                category === 'adult'
                  ? 'bg-lime-500/20 text-lime-100 ring-1 ring-inset ring-lime-500/40'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )}
            >
              러닝 스케줄
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={category === 'youth'}
              onClick={() => setCategory('youth')}
              className={cn(
                'min-w-0 flex-1 truncate rounded-md px-3 py-2.5 text-center text-sm font-semibold transition-colors',
                category === 'youth'
                  ? 'bg-lime-500/20 text-lime-100 ring-1 ring-inset ring-lime-500/40'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )}
            >
              {YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL} 스케줄
            </button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <MemberRunningLeagueTrainingSchedule
            key={category}
            days={activeBundle?.days}
            previousWeekDays={activeBundle?.previousWeekDays}
            nextWeekDays={activeBundle?.nextWeekDays}
            tableReady={activeBundle?.tableReady ?? true}
            canParticipate={false}
            canStaffProxySignup
            contentOnly
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
