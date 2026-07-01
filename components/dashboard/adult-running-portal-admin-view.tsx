'use client'

import { MemberPortalBrandHeader, MemberRunningLeagueRankings } from '@/components/dashboard/member-running-league-rankings'
import { MemberRunningLeagueTrainingSchedule } from '@/components/dashboard/member-running-league-training-schedule'
import { MemberPortalNoticePanel } from '@/components/dashboard/member-portal-notice-panel'
import { AdultRunningPortalSettingsPanel } from '@/components/dashboard/adult-running-portal-settings-panel'
import type { AdultRunningPortalAdminSettings } from '@/lib/actions/adult-running-portal-settings'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'
import type { CenterRunningTrainingScheduleBundle } from '@/lib/actions/center-running-training-schedule'
import { MEMBER_PORTAL_SHELL_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

type AdultRunningPortalAdminViewProps = {
  runningLeagueHome: MemberRunningLeagueHome
  centerTrainingSchedule: CenterRunningTrainingScheduleBundle
  portalSettings: AdultRunningPortalAdminSettings
}

export function AdultRunningPortalAdminView({
  runningLeagueHome,
  centerTrainingSchedule,
  portalSettings,
}: AdultRunningPortalAdminViewProps) {
  const trainingScheduleDays = centerTrainingSchedule.days ?? []
  const trainingScheduleReady = centerTrainingSchedule.tableReady ?? true

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-4">
      <AdultRunningPortalSettingsPanel settings={portalSettings} />

      <section className={cn(MEMBER_PORTAL_SHELL_CLASS, 'flex flex-col gap-2.5 sm:gap-4')}>
        <MemberPortalBrandHeader
          leagueLabel={portalSettings.leagueLabel}
          portalTitle={portalSettings.portalTitle}
          headerStyle={portalSettings.headerStyle}
          runningLeagueHome={runningLeagueHome}
          rankingReferenceDate={portalSettings.rankingReferenceDate}
          beatRivalMemberId={portalSettings.beatRivalMemberId}
        />
        <MemberPortalNoticePanel notice={portalSettings.notice} />
        <MemberRunningLeagueTrainingSchedule
          days={trainingScheduleDays}
          tableReady={trainingScheduleReady}
          canParticipate={false}
          readOnly
          embedded
        />
        <MemberRunningLeagueRankings
          pb5kLeaderboard={runningLeagueHome.pb5kLeaderboard}
          pb10kLeaderboard={runningLeagueHome.pb10kLeaderboard}
          pbHalfLeaderboard={runningLeagueHome.pbHalfLeaderboard}
          pbFullLeaderboard={runningLeagueHome.pbFullLeaderboard}
          mileageLeaderboard={runningLeagueHome.mileageLeaderboard}
          scoreLeaderboard={runningLeagueHome.scoreLeaderboard}
          rankingBundle={runningLeagueHome.rankingBundle}
          participant={runningLeagueHome.participant}
          pbRecords={runningLeagueHome.pbRecords}
          mileageLogs={runningLeagueHome.mileageLogs}
          tableReady={runningLeagueHome.tableReady}
          readOnly
          rankingsError={runningLeagueHome.rankingsError}
          beatRivalMemberId={portalSettings.beatRivalMemberId}
          portalLeagueLabel={portalSettings.leagueLabel}
          portalTitle={portalSettings.portalTitle}
          portalRankingReferenceDate={portalSettings.rankingReferenceDate}
          portalRankingCaption={portalSettings.rankingCaption}
          portalHeaderStyle={portalSettings.headerStyle}
          portalRankingCaptionStyle={portalSettings.rankingCaptionStyle}
          showBrandHeader={false}
          showPortalShell={false}
        />
      </section>
    </div>
  )
}
