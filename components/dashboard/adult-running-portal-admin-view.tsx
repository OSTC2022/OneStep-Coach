'use client'

import { MemberPortalBrandHeader, MemberRunningLeagueRankings } from '@/components/dashboard/member-running-league-rankings'
import { MemberRunningLeagueTrainingSchedule } from '@/components/dashboard/member-running-league-training-schedule'
import { MemberMarathonSchedule } from '@/components/dashboard/member-marathon-schedule'
import { MemberPortalNoticePanel } from '@/components/dashboard/member-portal-notice-panel'
import { MemberPortalAccordionMenus } from '@/components/dashboard/member-portal-accordion-menus'
import { AdultRunningPortalSettingsPanel } from '@/components/dashboard/adult-running-portal-settings-panel'
import { RunningPortalManageLink } from '@/components/dashboard/running-portal-manage-link'
import type { AdultRunningPortalAdminSettings } from '@/lib/actions/adult-running-portal-settings'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'
import type { CenterRunningTrainingScheduleBundle } from '@/lib/actions/center-running-training-schedule'
import type { CenterMarathonScheduleBundle } from '@/lib/actions/center-marathon-schedule'
import { MEMBER_PORTAL_SHELL_CLASS } from '@/lib/running-league/member-portal-layout'
import { cn } from '@/lib/utils'

type AdultRunningPortalAdminViewProps = {
  runningLeagueHome: MemberRunningLeagueHome
  centerTrainingSchedule: CenterRunningTrainingScheduleBundle
  marathonSchedule: CenterMarathonScheduleBundle
  portalSettings: AdultRunningPortalAdminSettings
}

export function AdultRunningPortalAdminView({
  runningLeagueHome,
  centerTrainingSchedule,
  marathonSchedule,
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
          rankingCycleStartDate={portalSettings.rankingCycleStartDate}
          beatRivalMemberId={portalSettings.beatRivalMemberId}
          action={<RunningPortalManageLink compact />}
        />
        <MemberPortalAccordionMenus
          hasNotice={Boolean(portalSettings.notice?.trim())}
          hasMarathon
          notice={<MemberPortalNoticePanel notice={portalSettings.notice} contentOnly />}
          training={
            <MemberRunningLeagueTrainingSchedule
              days={trainingScheduleDays}
              tableReady={trainingScheduleReady}
              canParticipate={false}
              readOnly
              embedded
              contentOnly
            />
          }
          marathon={
            <MemberMarathonSchedule
              bundle={marathonSchedule}
              canParticipate={false}
              readOnly
              embedded
              contentOnly
              showManageLink
              canPinEvents
            />
          }
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
          portalRankingCycleStartDate={portalSettings.rankingCycleStartDate}
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
