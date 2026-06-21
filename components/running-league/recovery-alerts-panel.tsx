'use client'

import { AlertTriangle, HeartPulse } from 'lucide-react'
import { collectRecoveryAlerts } from '@/lib/running-league/recovery'
import type { RunningLeagueDailyRecovery, RunningLeagueParticipant } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface RecoveryAlertsPanelProps {
  participants: RunningLeagueParticipant[]
  dailyRecoveries: RunningLeagueDailyRecovery[]
}

export function RecoveryAlertsPanel({
  participants,
  dailyRecoveries,
}: RecoveryAlertsPanelProps) {
  const memberNameById = new Map(
    participants.map((row) => [row.member_id, row.member?.name ?? '회원']),
  )
  const alerts = collectRecoveryAlerts(dailyRecoveries, memberNameById, { days: 14 })

  if (alerts.length === 0) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="py-4 text-sm text-emerald-200/90">
          최근 2주간 통증·무리 훈련 경고가 없습니다. 회복 중심으로 잘 관리되고 있습니다.
        </CardContent>
      </Card>
    )
  }

  const painAlerts = alerts.filter((row) => row.type === 'pain_severe')
  const overtrainingAlerts = alerts.filter((row) => row.type !== 'pain_severe')

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-100">
          <AlertTriangle className="h-4 w-4" />
          회복관리 주의 회원
        </CardTitle>
        <p className="text-xs text-amber-100/70">
          통증·무리 훈련 기록은 코치/관리자만 확인합니다. 순위표에는 노출되지 않습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {painAlerts.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-red-300">통증 심함</p>
            {painAlerts.map((alert) => (
              <div
                key={`${alert.participantId}-${alert.loggedAt}-pain`}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm',
                  'border-red-500/40 bg-red-500/10 text-red-100',
                )}
              >
                <p className="font-medium">{alert.memberName}</p>
                <p className="text-xs text-red-100/80">{alert.detail}</p>
              </div>
            ))}
          </div>
        ) : null}

        {overtrainingAlerts.length > 0 ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1 text-xs font-semibold text-amber-200">
              <HeartPulse className="h-3.5 w-3.5" />
              무리한 훈련 기록
            </p>
            {overtrainingAlerts.map((alert) => (
              <div
                key={`${alert.participantId}-${alert.loggedAt}-${alert.type}`}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-50"
              >
                <p className="font-medium">{alert.memberName}</p>
                <p className="text-xs text-amber-50/80">{alert.detail}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function ParticipantRecoveryAlertBadge({
  participant,
  dailyRecoveries,
}: {
  participant: RunningLeagueParticipant
  dailyRecoveries: RunningLeagueDailyRecovery[]
}) {
  const memberName = participant.member?.name ?? '회원'
  const alerts = collectRecoveryAlerts(
    dailyRecoveries.filter((row) => row.participant_id === participant.id),
    new Map([[participant.member_id, memberName]]),
    { days: 7 },
  )

  if (alerts.length === 0) return null

  const hasPain = alerts.some((row) => row.type === 'pain_severe')
  const hasOvertraining = alerts.some((row) => row.type !== 'pain_severe')

  return (
    <div className="flex flex-wrap gap-1.5">
      {hasPain ? (
        <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
          통증 심함
        </span>
      ) : null}
      {hasOvertraining ? (
        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
          무리 훈련
        </span>
      ) : null}
    </div>
  )
}
