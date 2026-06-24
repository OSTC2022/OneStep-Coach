'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  ArrowLeft,
  Flag,
  HeartPulse,
  MessageSquareQuote,
  Route,
  Sparkles,
  Target,
  Timer,
  Trophy,
} from 'lucide-react'
import { RunningLeagueMemberReportCard } from '@/components/dashboard/running-league-member-report-card'
import { MemberMileageLogDialog } from '@/components/dashboard/member-mileage-log-dialog'
import { DailyRecoveryForm } from '@/components/running-league/daily-recovery-form'
import { RecordMeasurementPanel } from '@/components/running-league/record-measurement-panel'
import { RunningLeagueLeaderboard } from '@/components/running-league/running-league-leaderboard'
import { Button } from '@/components/ui/button'
import { saveDailyRecovery } from '@/lib/actions/running-league'
import { RUNNING_LEAGUE_STATUS_LABELS } from '@/lib/running-league/constants'
import {
  buildMemberGrowthSnapshot,
  buildMemberRecordAnalysis,
  formatMemberProgressStatus,
  formatMemberScoreDetail,
  getMemberWeeklyMission,
} from '@/lib/running-league/member-portal'
import { dailyRecoveryToFormState } from '@/lib/running-league/recovery'
import { computeTotalScore } from '@/lib/running-league/scoring'
import type {
  RunningLeague,
  RunningLeagueAward,
  RunningLeagueDailyRecovery,
  RunningLeagueParticipant,
  RunningLeagueRecord,
  RunningLeagueReport,
  RunningLeagueMileageLog,
} from '@/lib/types'
import type { RunningLeagueRankRow } from '@/lib/running-league/scoring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RunningLeagueMemberViewProps {
  league: RunningLeague | null
  participant: RunningLeagueParticipant | null
  records: RunningLeagueRecord[]
  dailyRecoveries: RunningLeagueDailyRecovery[]
  todayRecovery: RunningLeagueDailyRecovery | null
  memberAwards: RunningLeagueAward[]
  publishedReport: RunningLeagueReport | null
  attendanceCount: number
  myRank: number | null
  leaderboard: RunningLeagueRankRow[]
  mileageLogs: RunningLeagueMileageLog[]
  tableReady: boolean
  readOnly?: boolean
  backHref?: string | null
}

function formatDate(value: string): string {
  try {
    return format(parseISO(value), 'M월 d일', { locale: ko })
  } catch {
    return value
  }
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-background/70 px-3 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold leading-snug">{value}</p>
      {hint ? <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function MileageProgressTile({
  mileageKm,
  readOnly = false,
  onOpenManual,
}: {
  mileageKm: number
  readOnly?: boolean
  onOpenManual?: () => void
}) {
  const empty = mileageKm <= 0

  return (
    <div className="col-span-2 space-y-2 rounded-xl border bg-background/70 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Route className="h-3.5 w-3.5 shrink-0" />
        <span>누적 거리</span>
      </div>
      <p className="text-lg font-semibold">{mileageKm} km</p>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {empty ? '이번 달 러닝 기록이 아직 없어요' : '이번 달 누적 거리입니다'}
      </p>
      {!readOnly ? (
        <div className="pt-1">
          <Button
            type="button"
            size="sm"
            className="min-h-11 w-full"
            onClick={onOpenManual}
          >
            러닝 기록 입력하기
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function LeagueHeroCard({
  league,
  participant,
}: {
  league: RunningLeague
  participant: RunningLeagueParticipant | null
}) {
  const weekly = getMemberWeeklyMission(league)
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-primary">ONE STEP RUNNING LEAGUE</p>
          <h1 className="text-xl font-bold">{league.title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(league.starts_at)} ~ {formatDate(league.ends_at)} ·{' '}
            {RUNNING_LEAGUE_STATUS_LABELS[league.status]}
          </p>
        </div>
        {participant ? (
          <p className="rounded-lg border border-primary/15 bg-background/60 px-3 py-2 text-sm leading-relaxed text-foreground/90">
            {participant.member?.name ?? '회원'}님, 이번 달은 기록보다 <span className="font-medium">꾸준한 성장</span>
            이 더 중요합니다. 코치가 컨디션과 회복을 함께 확인하고 있습니다.
          </p>
        ) : null}
        <div className="rounded-lg border bg-background/50 px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">{weekly.weekLabel} · {weekly.title}</p>
          <p className="mt-1 text-sm">{weekly.mission}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function GrowthDashboardCard({
  participant,
  records,
  dailyRecoveries,
  attendanceCount,
  myRank,
  totalParticipants,
  readOnly = false,
  onOpenMileageManual,
}: {
  participant: RunningLeagueParticipant
  records: RunningLeagueRecord[]
  dailyRecoveries: RunningLeagueDailyRecovery[]
  attendanceCount: number
  myRank: number | null
  totalParticipants: number
  readOnly?: boolean
  onOpenMileageManual?: () => void
}) {
  const totalScore = computeTotalScore({
    attendance_score: participant.attendance_score,
    goal_score: participant.goal_score,
    record_score: participant.record_score,
    mileage_score: participant.mileage_score,
    recovery_score: participant.recovery_score,
  })
  const snapshot = buildMemberGrowthSnapshot({
    participant,
    records,
    dailyRecoveries,
    rank: myRank,
    totalParticipants,
    attendanceCount,
    totalScore,
  })
  const scoreDetail = formatMemberScoreDetail(snapshot.totalScore)
  const progressStatus = formatMemberProgressStatus(snapshot.rank, snapshot.totalParticipants)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          나의 성장 한눈에 보기
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <StatTile
            label={scoreDetail.label}
            value={scoreDetail.value}
            hint={scoreDetail.hint}
          />
          <StatTile
            label={progressStatus.label}
            value={progressStatus.value}
            hint={progressStatus.hint}
          />
          <StatTile
            label="목표 달성률"
            value={snapshot.goalAchievementRate != null ? `${snapshot.goalAchievementRate}%` : '—'}
            hint="개인 목표 기준으로 계산됩니다"
          />
          <StatTile
            label="누적 출석"
            value={`${snapshot.attendanceCount}회`}
            hint="꾸준한 출석이 점수에 반영됩니다"
          />
          <MileageProgressTile
            mileageKm={snapshot.mileageKm}
            readOnly={readOnly}
            onOpenManual={onOpenMileageManual}
          />
          <StatTile
            label="회복관리"
            value={
              snapshot.recoveryCheckCount > 0
                ? `${snapshot.recoveryCheckCount}회 체크 완료`
                : '아직 기록 없음'
            }
            hint="꾸준히 기록할수록 점수가 올라갑니다 · 총점에 10% 반영"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function PersonalGoalCard({ participant }: { participant: RunningLeagueParticipant }) {
  return (
    <Card id="member-personal-goal">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" />
          나의 개인 목표
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="rounded-lg border bg-muted/20 px-3 py-2 text-base font-medium leading-relaxed">
          {participant.personal_goal || '코치와 함께 개인 목표를 설정해주세요.'}
        </p>
        {participant.goal_achievement_rate != null ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>달성률</span>
              <span className="font-medium text-foreground">{participant.goal_achievement_rate}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, participant.goal_achievement_rate)}%` }}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function WeeklyMissionCard({
  league,
  readOnly = false,
  onOpenMileage,
}: {
  league: RunningLeague
  readOnly?: boolean
  onOpenMileage?: () => void
}) {
  const weekly = getMemberWeeklyMission(league)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="h-4 w-4" />
          이번 주 미션
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="font-medium">
          {weekly.weekLabel} · {weekly.title}
        </p>
        <p className="rounded-lg border bg-muted/15 px-3 py-2 leading-relaxed">{weekly.mission}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{weekly.coachNote}</p>
        {!readOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="outline" size="sm" className="min-h-11 w-full flex-1 sm:w-auto">
              <a href="#member-personal-goal">목표 확인하기</a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 w-full flex-1 sm:w-auto"
              onClick={onOpenMileage}
            >
              러닝 기록 입력하기
            </Button>
            <Button asChild variant="outline" size="sm" className="min-h-11 w-full flex-1 sm:w-auto">
              <a href="#member-recovery">회복관리 체크하기</a>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function MemberRecordCard({
  participant,
  records,
}: {
  participant: RunningLeagueParticipant
  records: RunningLeagueRecord[]
}) {
  const recordInfo = useMemo(
    () => buildMemberRecordAnalysis(participant, records),
    [participant, records],
  )

  if (!recordInfo) return null

  const pair = {
    monthStart: recordInfo.analysis.monthStartText ?? '',
    monthEnd: recordInfo.analysis.monthEndText ?? '',
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="h-4 w-4" />
          나의 기록 변화
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RecordMeasurementPanel
          distance={recordInfo.distance}
          monthStart={pair.monthStart}
          monthEnd={pair.monthEnd}
          readOnly
          memberView
        />
      </CardContent>
    </Card>
  )
}

function CoachFeedbackCard({ participant }: { participant: RunningLeagueParticipant }) {
  const comment = participant.coach_comment?.trim()
  if (!comment) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareQuote className="h-4 w-4" />
            코치 피드백
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            코치가 훈련 후 피드백을 남기면 이곳에서 확인할 수 있습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-sky-500/20 bg-sky-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-sky-100">
          <MessageSquareQuote className="h-4 w-4" />
          코치 피드백
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-sky-50/95">{comment}</p>
      </CardContent>
    </Card>
  )
}

function MemberRecoveryCard({
  participant,
  dailyRecoveries,
  todayRecovery,
  readOnly = false,
}: {
  participant: RunningLeagueParticipant
  dailyRecoveries: RunningLeagueDailyRecovery[]
  todayRecovery: RunningLeagueDailyRecovery | null
  readOnly?: boolean
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Card id="member-recovery">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartPulse className="h-4 w-4" />
          오늘 회복관리
        </CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          컨디션·통증·스트레칭은 코치만 확인합니다. 순위표에는 공개되지 않습니다.
        </p>
      </CardHeader>
      <CardContent>
        <DailyRecoveryForm
          key={todayRecovery?.id ?? `recovery-${today}`}
          initialForm={dailyRecoveryToFormState(todayRecovery)}
          history={dailyRecoveries}
          readOnly={readOnly}
          memberView
          onSave={async (form) => {
            const result = await saveDailyRecovery({
              participant_id: participant.id,
              league_id: participant.league_id,
              member_id: participant.member_id,
              form,
            })
            if (result.ok) router.refresh()
            return result
          }}
        />
      </CardContent>
    </Card>
  )
}

function MemberAwardsCard({ awards }: { awards: RunningLeagueAward[] }) {
  if (awards.length === 0) return null

  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4" />
          이번 달 수상
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {awards.map((award) => (
          <div key={award.id} className="rounded-lg border border-amber-500/20 bg-background/50 px-3 py-2">
            <p className="text-sm font-medium">{award.award_name}</p>
            <p className="text-xs text-muted-foreground">{award.reason}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function RunningLeagueMemberView({
  league,
  participant,
  records,
  dailyRecoveries,
  todayRecovery,
  memberAwards,
  publishedReport,
  attendanceCount,
  myRank,
  leaderboard,
  mileageLogs,
  tableReady,
  readOnly = false,
  backHref = '/dashboard/my',
}: RunningLeagueMemberViewProps) {
  const [mileageDialogOpen, setMileageDialogOpen] = useState(false)
  const resolvedBackHref = readOnly ? null : backHref

  const openMileageManual = () => {
    setMileageDialogOpen(true)
  }

  const backButton =
    resolvedBackHref ? (
      <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9 shrink-0">
        <Link href={resolvedBackHref} aria-label="내 포털로 돌아가기">
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </Button>
    ) : null

  if (!tableReady) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        {backButton}
        <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          러닝 리그 기능 준비 중입니다. 센터에 문의해주세요.
        </CardContent>
      </Card>
      </div>
    )
  }

  if (!league) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        {backButton}
        <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          현재 확인할 수 있는 러닝 리그가 없습니다.
        </CardContent>
      </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      {backButton}

      <LeagueHeroCard league={league} participant={participant} />

      {!participant ? (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            아직 이번 리그 참가 등록이 되어 있지 않습니다. 코치에게 참가 등록을 요청해주세요.
          </CardContent>
        </Card>
      ) : (
        <>
          <GrowthDashboardCard
            participant={participant}
            records={records}
            dailyRecoveries={dailyRecoveries}
            attendanceCount={attendanceCount}
            myRank={myRank}
            totalParticipants={leaderboard.length}
            readOnly={readOnly}
            onOpenMileageManual={readOnly ? undefined : openMileageManual}
          />
          <PersonalGoalCard participant={participant} />
          <WeeklyMissionCard
            league={league}
            readOnly={readOnly}
            onOpenMileage={readOnly ? undefined : openMileageManual}
          />
          <MemberRecordCard participant={participant} records={records} />
          <CoachFeedbackCard participant={participant} />
          <MemberRecoveryCard
            participant={participant}
            dailyRecoveries={dailyRecoveries}
            todayRecovery={todayRecovery}
            readOnly={readOnly}
          />
          <MemberAwardsCard awards={memberAwards} />
          <RunningLeagueMemberReportCard
            report={publishedReport}
            memberName={participant.member?.name ?? '회원'}
            leagueTitle={league.title}
          />
        </>
      )}

      {leaderboard.length > 0 ? (
        <RunningLeagueLeaderboard
          rows={leaderboard}
          title="참가자 순위 보기"
          highlightMemberId={participant?.member_id ?? null}
          compact
        />
      ) : null}

      {participant && !readOnly ? (
        <MemberMileageLogDialog
          participant={participant}
          mileageLogs={mileageLogs}
          tableReady={tableReady}
          open={mileageDialogOpen}
          onOpenChange={setMileageDialogOpen}
        />
      ) : null}
    </div>
  )
}
