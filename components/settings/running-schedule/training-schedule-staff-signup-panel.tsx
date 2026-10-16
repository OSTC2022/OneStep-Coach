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
          하단 <strong>수정</strong>에서 날짜만 골라 훈련 내용을 바꿀 수 있습니다. 요일을 누르면
          참여 명단에서 수업 내용·시간·장소를 바로 고칠 수 있습니다. 저장하면{' '}
          {audience === 'youth_athletics' ? '육상' : '러닝'} 포털에 바로 반영됩니다. 참여자는
          관리자·강사가 넣거나 뺄 수 있습니다.
        </p>
      </CardHeader>
      <CardContent>
        <MemberRunningLeagueTrainingSchedule
          days={bundle?.days}
          previousWeekDays={bundle?.previousWeekDays}
          nextWeekDays={bundle?.nextWeekDays}
          tableReady={bundle?.tableReady ?? true}
          canParticipate={false}
          canStaffProxySignup
          canEditDays
          scheduleAudience={audience}
          embedded
          contentOnly
        />
      </CardContent>
    </Card>
  )
}
