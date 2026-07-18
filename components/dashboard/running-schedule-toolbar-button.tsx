'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { MemberRunningLeagueTrainingSchedule } from '@/components/dashboard/member-running-league-training-schedule'
import { getCenterRunningTrainingScheduleForStaff } from '@/lib/actions/center-running-training-schedule'
import type { CenterRunningTrainingScheduleBundle } from '@/lib/actions/center-running-training-schedule'
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

type RunningScheduleToolbarButtonProps = {
  initialBundle?: CenterRunningTrainingScheduleBundle | null
  triggerClassName?: string
}

export function RunningScheduleToolbarButton({
  initialBundle = null,
  triggerClassName,
}: RunningScheduleToolbarButtonProps) {
  const [open, setOpen] = useState(false)
  const [bundle, setBundle] = useState<CenterRunningTrainingScheduleBundle | null>(
    initialBundle,
  )

  useEffect(() => {
    setBundle(initialBundle)
  }, [initialBundle])

  const dayCount = useMemo(() => {
    const days = bundle?.days ?? []
    return days.filter(
      (day) =>
        !day.is_hidden &&
        (Boolean(day.schedule_date) || Boolean(day.training_summary?.trim())),
    ).length
  }, [bundle])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    void getCenterRunningTrainingScheduleForStaff()
      .then((result) => setBundle(result))
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
        className="flex max-h-[min(88vh,720px)] w-[min(100vw-1.5rem,440px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        opaqueBackdrop
      >
        <DialogHeader className="shrink-0 border-b border-border/70 bg-muted/25 px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
            러닝 스케줄
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            이번 주 센터 러닝 훈련 일정
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <MemberRunningLeagueTrainingSchedule
            days={bundle?.days ?? []}
            tableReady={bundle?.tableReady ?? true}
            canParticipate={false}
            readOnly
            contentOnly
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
