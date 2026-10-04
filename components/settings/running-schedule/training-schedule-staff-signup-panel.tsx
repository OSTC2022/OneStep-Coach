'use client'

import { useEffect, useState } from 'react'
import { MemberRunningLeagueTrainingSchedule } from '@/components/dashboard/member-running-league-training-schedule'
import {
  getCenterRunningTrainingScheduleForStaff,
  type CenterRunningTrainingScheduleBundle,
} from '@/lib/actions/center-running-training-schedule'
import type { TrainingScheduleAudience } from '@/lib/training-schedule-audience'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type TrainingScheduleStaffSignupPanelProps = {
  audience?: TrainingScheduleAudience
}

export function TrainingScheduleStaffSignupPanel({
  audience = 'adult_running',
}: TrainingScheduleStaffSignupPanelProps) {
  const [bundle, setBundle] = useState<CenterRunningTrainingScheduleBundle | null>(null)

  useEffect(() => {
    let cancelled = false
    void getCenterRunningTrainingScheduleForStaff(audience)
      .then((result) => {
        if (!cancelled) setBundle(result)
      })
      .catch(() => {
        if (!cancelled) setBundle(null)
      })
    return () => {
      cancelled = true
    }
  }, [audience])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">참여 현황 · 대리 신청</CardTitle>
        <p className="text-xs text-muted-foreground">
          평일 18시 / 주말 16시(KST) 이후에는 회원 직접 신청이 마감됩니다. 마감 후{' '}
          <strong>참여</strong>를 누르면 회원(강사 포함)을 선택해 대리 등록할 수 있습니다. 취소는
          해당 회원이 언제든 가능합니다.
        </p>
      </CardHeader>
      <CardContent>
        <MemberRunningLeagueTrainingSchedule
          days={bundle?.days ?? []}
          previousWeekDays={bundle?.previousWeekDays ?? []}
          nextWeekDays={bundle?.nextWeekDays ?? []}
          tableReady={bundle?.tableReady ?? true}
          canParticipate={false}
          canStaffProxySignup
          embedded
          contentOnly
        />
      </CardContent>
    </Card>
  )
}
