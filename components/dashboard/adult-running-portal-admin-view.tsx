'use client'

import { useEffect, useRef, useState } from 'react'
import { MemberPortalBrandHeader, MemberRunningLeagueRankings } from '@/components/dashboard/member-running-league-rankings'
import { MemberRunningLeagueTrainingSchedule } from '@/components/dashboard/member-running-league-training-schedule'
import { MemberMarathonSchedule } from '@/components/dashboard/member-marathon-schedule'
import { MemberPortalNoticePanel } from '@/components/dashboard/member-portal-notice-panel'
import { MemberPortalAccordionMenus } from '@/components/dashboard/member-portal-accordion-menus'
import { AdultRunningPortalSettingsPanel } from '@/components/dashboard/adult-running-portal-settings-panel'
import { RunningPortalManageLink } from '@/components/dashboard/running-portal-manage-link'
import type {
  AdultRunningPortalAdminSettings,
  AdultRunningPortalDraftPreview,
} from '@/lib/actions/adult-running-portal-settings'
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

function draftFromSettings(settings: AdultRunningPortalAdminSettings): AdultRunningPortalDraftPreview {
  return {
    leagueLabel: settings.leagueLabel,
    portalTitle: settings.portalTitle,
    notice: settings.notice ?? '',
    rankingCaption: settings.rankingCaption ?? '',
    headerStyle: settings.headerStyle,
    rankingCaptionStyle: settings.rankingCaptionStyle,
  }
}

function draftFingerprint(draft: AdultRunningPortalDraftPreview): string {
  return JSON.stringify({
    leagueLabel: draft.leagueLabel,
    portalTitle: draft.portalTitle,
    notice: draft.notice,
    rankingCaption: draft.rankingCaption,
    headerStyle: draft.headerStyle,
    rankingCaptionStyle: draft.rankingCaptionStyle,
  })
}

export function AdultRunningPortalAdminView({
  runningLeagueHome,
  centerTrainingSchedule,
  marathonSchedule,
  portalSettings,
}: AdultRunningPortalAdminViewProps) {
  const trainingScheduleDays = centerTrainingSchedule.days ?? []
  const trainingSchedulePreviousWeekDays =
    centerTrainingSchedule.previousWeekDays ?? []
  const trainingScheduleReady = centerTrainingSchedule.tableReady ?? true

  const [draft, setDraft] = useState(() => draftFromSettings(portalSettings))
  const lastSavedFingerprintRef = useRef<string | null>(null)

  useEffect(() => {
    const next = draftFromSettings(portalSettings)
    const nextKey = draftFingerprint(next)

    // 저장 직후: 서버가 따라올 때까지 stale props로 draft를 덮지 않음
    if (lastSavedFingerprintRef.current) {
      if (nextKey === lastSavedFingerprintRef.current) {
        lastSavedFingerprintRef.current = null
      }
      return
    }

    setDraft(next)
  }, [portalSettings])

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-4">
      <AdultRunningPortalSettingsPanel
        settings={portalSettings}
        draft={draft}
        onDraftChange={setDraft}
        onSaved={(saved) => {
          lastSavedFingerprintRef.current = draftFingerprint(saved)
          setDraft(saved)
        }}
      />

      <section className={cn(MEMBER_PORTAL_SHELL_CLASS, 'flex flex-col gap-2.5 sm:gap-4')}>
        <MemberPortalBrandHeader
          leagueLabel={draft.leagueLabel}
          portalTitle={draft.portalTitle}
          headerStyle={draft.headerStyle}
          runningLeagueHome={runningLeagueHome}
          rankingReferenceDate={portalSettings.rankingReferenceDate}
          rankingCycleStartDate={portalSettings.rankingCycleStartDate}
          beatRivalMemberId={portalSettings.beatRivalMemberId}
          action={<RunningPortalManageLink compact />}
        />
        <MemberPortalAccordionMenus
          hasNotice={Boolean(draft.notice.trim())}
          hasMarathon
          notice={<MemberPortalNoticePanel notice={draft.notice || null} contentOnly />}
          training={
            <MemberRunningLeagueTrainingSchedule
              days={trainingScheduleDays}
              previousWeekDays={trainingSchedulePreviousWeekDays}
              tableReady={trainingScheduleReady}
              canParticipate={false}
              canStaffProxySignup
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
          portalLeagueLabel={draft.leagueLabel}
          portalTitle={draft.portalTitle}
          portalRankingReferenceDate={portalSettings.rankingReferenceDate}
          portalRankingCycleStartDate={portalSettings.rankingCycleStartDate}
          portalRankingCaption={draft.rankingCaption || null}
          portalHeaderStyle={draft.headerStyle}
          portalRankingCaptionStyle={draft.rankingCaptionStyle}
          showBrandHeader={false}
          showPortalShell={false}
        />
      </section>
    </div>
  )
}
