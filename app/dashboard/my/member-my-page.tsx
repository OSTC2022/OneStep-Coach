'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  Activity,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  LineChart,
  Trophy,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MemberCenterContactCard } from '@/components/members/member-center-contact-card'
import { MemberRunningLeagueRankings } from '@/components/dashboard/member-running-league-rankings'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'
import type { MemberPortalData, MemberPortalSessionStatus } from '@/lib/member-portal-types'
import { MEMBER_REPORT_MIN_RECORDS } from '@/lib/member-portal-summary'
import { portalStatusToneClass } from '@/lib/member-portal-status'
import type { Member } from '@/lib/types'
import { formatPackageExpiryDateLabel } from '@/lib/session-package-utils'
import { cn } from '@/lib/utils'

interface MemberMyPageProps {
  data: MemberPortalData
  role?: string | null
  runningLeagueHome?: MemberRunningLeagueHome | null
  adminPreview?: boolean
  runningLeagueHref?: string
}

function formatSportProfile(member: Member): string | null {
  const parts = [member.sport, member.grade].filter((value) => value?.trim())
  return parts.length > 0 ? parts.join(' · ') : null
}

function formatTodayRecordSummary(recorded: boolean): string {
  return recorded ? '완료' : '입력 필요'
}

function formatRemainingSessionsHint(sessionStatus: MemberPortalSessionStatus): string {
  if (sessionStatus.kind === 'monthly') {
    return sessionStatus.expiresAt
      ? `만료일 ${formatPackageExpiryDateLabel(sessionStatus.expiresAt)}`
      : '만료일 미지정'
  }
  if (!sessionStatus.isUsable) return '수업권 확인 필요'
  return '수업권 정상'
}

function formatSessionStatusValue(sessionStatus: MemberPortalSessionStatus): string {
  if (sessionStatus.kind === 'monthly') {
    return sessionStatus.remainingPeriodLabel
  }
  if (!sessionStatus.isUsable) return '수업권 확인 필요'
  return '정상 이용 중'
}

function monthlySessionStatusToneClass(
  sessionStatus: Extract<MemberPortalSessionStatus, { kind: 'monthly' }>,
): string {
  const days = sessionStatus.daysUntilExpiry
  if (days != null && days < 0) return 'text-destructive'
  if (days != null && days <= 7) return 'text-amber-300'
  return 'text-primary'
}

function formatTodayRecordHint(recorded: boolean): string {
  return recorded ? '오늘 상태 저장됨' : '훈련 전 상태 체크'
}

function resolveProfileAside(data: MemberPortalData) {
  const { summary, sessionStatus } = data

  if (sessionStatus.kind === 'monthly') {
    return {
      label: '수업 상태',
      value: sessionStatus.remainingPeriodLabel,
      valueClassName: monthlySessionStatusToneClass(sessionStatus),
      hint: sessionStatus.expiresAt
        ? `만료일 ${formatPackageExpiryDateLabel(sessionStatus.expiresAt)}`
        : '만료일 미지정',
    }
  }

  if (!sessionStatus.isUsable) {
    return {
      label: '수업 상태',
      value: formatSessionStatusValue(sessionStatus),
      valueClassName: 'text-amber-300',
      hint: '센터에 문의해주세요',
    }
  }

  const { athleteStatus } = summary
  return {
    label: '선수 상태',
    value: athleteStatus.label,
    valueClassName: portalStatusToneClass(athleteStatus.tone),
    hint: athleteStatus.hint,
  }
}

export function MemberMyPage({
  data,
  role,
  runningLeagueHome,
  adminPreview = false,
  runningLeagueHref = '/dashboard/my/running-league',
}: MemberMyPageProps) {
  const { member, summary, centerContact, coachContact, sessionStatus } = data
  const isAdultMember = role === 'adult_member'
  const instructorName = member.primary_instructor?.name ?? '자율배정'
  const sportProfile = formatSportProfile(member)
  const todayRecordLabel = formatTodayRecordSummary(summary.todayRecorded)
  const reportReady = summary.wellnessRecordCount >= MEMBER_REPORT_MIN_RECORDS
  const profileAside = isAdultMember
    ? null
    : resolveProfileAside(data)

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {isAdultMember ? 'ONE STEP RUNNING LEAGUE' : 'ONESTEP ATHLETE REPORT'}
        </p>
        <h1 className="text-2xl font-bold lg:text-3xl">
          {isAdultMember ? '내 러닝 포털' : '내 선수 리포트'}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {isAdultMember
            ? '내 순위·마일리지·PB 변화와 성장 그래프를 한눈에 확인하세요.'
            : '오늘 상태를 기록하면 코치가 훈련 강도와 회복 상태를 더 정확히 확인할 수 있습니다.'}
        </p>
      </div>

      {isAdultMember && runningLeagueHome?.league ? (
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
          readOnly={adminPreview}
          rankingsError={runningLeagueHome.rankingsError}
          highlightMemberId={member.id}
          runningLeagueDetailHref={runningLeagueHref}
        />
      ) : null}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 sm:p-6">
          {isAdultMember ? (
            <div className="space-y-1">
              <p className="text-xl font-bold leading-tight lg:text-2xl">{member.name}</p>
              {sportProfile ? (
                <p className="text-sm text-foreground/90 lg:text-base">{sportProfile}</p>
              ) : null}
              {member.school ? (
                <p className="text-sm text-muted-foreground lg:text-base">{member.school}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                담당 코치:{' '}
                <span className="font-medium text-foreground">{instructorName}</span>
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 md:items-center md:gap-8">
              <div className="space-y-1.5">
                <p className="text-xl font-bold lg:text-2xl">
                  {member.name}
                  {' 선수'}
                </p>
                {sportProfile ? (
                  <p className="text-sm text-foreground/90 lg:text-base">{sportProfile}</p>
                ) : null}
                {member.school ? (
                  <p className="text-sm text-muted-foreground lg:text-base">{member.school}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  담당 코치:{' '}
                  <span className="font-medium text-foreground">{instructorName}</span>
                </p>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/30 px-3.5 py-3 md:border-l md:border-y-0 md:border-r-0 md:bg-transparent md:pl-8">
                {profileAside ? (
                  <>
                    <p className="text-xs font-medium text-muted-foreground">
                      {profileAside.label}
                    </p>
                    <p
                      className={cn(
                        'mt-0.5 text-lg font-semibold text-foreground lg:text-xl',
                        profileAside.valueClassName,
                      )}
                    >
                      {profileAside.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{profileAside.hint}</p>
                    {!sessionStatus.isUsable ? (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="mt-3 min-h-10 w-full border-primary/30 bg-background/50 sm:w-auto"
                      >
                        <Link href="/dashboard/my/sessions#lesson-records">
                          수업권 확인하러 가기
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <SummaryCard
          title={isAdultMember && sessionStatus.kind === 'monthly' ? '수업권 남은 기간' : sessionStatus.kind === 'monthly' ? '남은 기간' : '남은 수업'}
          icon={<CreditCard className="h-3.5 w-3.5 shrink-0 opacity-70" />}
          value={
            sessionStatus.kind === 'monthly'
              ? sessionStatus.remainingPeriodLabel
              : `${sessionStatus.remainingSessions ?? 0}회`
          }
          valueClassName={
            sessionStatus.kind === 'monthly'
              ? monthlySessionStatusToneClass(sessionStatus)
              : !sessionStatus.isUsable
                ? 'text-amber-300'
                : undefined
          }
          hint={formatRemainingSessionsHint(sessionStatus)}
        />
        <SummaryCard
          title="최근 출석일"
          icon={<CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" />}
          value={
            summary.recentAttendanceDate
              ? format(parseISO(summary.recentAttendanceDate), 'M/d')
              : '기록 없음'
          }
          hint="마지막 수업"
        />
        <SummaryCard
          title="최근 컨디션"
          icon={<Activity className="h-3.5 w-3.5 shrink-0 opacity-70" />}
          value={summary.recentCondition.label}
          valueClassName={portalStatusToneClass(summary.recentCondition.tone)}
          hint={summary.recentCondition.hint}
        />
        <SummaryCard
          title="오늘 기록"
          icon={<ClipboardCheck className="h-3.5 w-3.5 shrink-0 opacity-70" />}
          value={todayRecordLabel}
          valueClassName={
            summary.todayRecorded ? 'text-emerald-300' : 'text-amber-300'
          }
          hint={formatTodayRecordHint(summary.todayRecorded)}
          highlighted={!summary.todayRecorded}
        />
      </div>

      {isAdultMember ? (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-transparent">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="h-4 w-4 text-primary" />
                러닝 챌린지
              </p>
              <p className="text-sm text-muted-foreground">
                출석·목표·기록·마일리지·회복관리 점수와 순위를 확인하세요.
              </p>
            </div>
            <Button asChild className="min-h-11 w-full shrink-0 sm:w-auto">
              <Link href={runningLeagueHref}>
                리그 보기
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-primary/15">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0 space-y-2">
            <p className="text-base font-semibold lg:text-lg">오늘 관리</p>
            {summary.todayRecorded ? (
              <>
                <p className="text-sm font-medium text-foreground lg:text-base">
                  오늘 상태 기록이 완료되었습니다.
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground lg:text-base">
                  코치가 훈련 강도와 회복 상태를 확인할 수 있습니다.
                </p>
                {summary.todayRecordSummary ? (
                  <p className="text-sm leading-relaxed text-foreground/90">
                    <span className="font-medium text-foreground">기록 요약: </span>
                    {summary.todayRecordSummary}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground lg:text-base">
                  오늘 컨디션 기록이 아직 없습니다.
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground lg:text-base">
                  훈련 전 수면, 피로도, 통증, 식사 상태를 기록해주세요.
                </p>
                <p className="text-xs text-muted-foreground">기록 예상 시간: 약 30초</p>
              </>
            )}
          </div>

          <Button asChild className="min-h-11 w-full shrink-0 sm:w-auto sm:min-w-[200px]">
            <Link href="/dashboard/my/body#report-top" scroll={false}>
              {summary.todayRecorded ? '오늘 기록 수정하기' : '오늘 상태 기록하기'}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {!isAdultMember ? (
      <Card className="border-border/70">
        <CardHeader className="pb-2 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
            <LineChart className="h-4 w-4 text-primary" />
            내 리포트
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6 sm:pt-0">
          <p className="text-sm leading-relaxed text-muted-foreground">
            최근 기록이 3회 이상 쌓이면 컨디션 변화와 코치 체크를 확인할 수 있습니다.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">최근 기록</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {summary.wellnessRecordCount}회
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">최근 컨디션</p>
              <p
                className={cn(
                  'mt-0.5 text-lg font-bold',
                  portalStatusToneClass(summary.recentCondition.tone),
                )}
              >
                {summary.recentCondition.label}
              </p>
            </div>
          </div>

          {!reportReady ? (
            <p className="text-sm font-medium text-amber-200/90">
              3회 이상 기록하면 컨디션 흐름을 확인할 수 있습니다.
            </p>
          ) : null}

          {reportReady ? (
            <Button
              asChild
              variant="outline"
              className="min-h-11 w-full border-border/70 bg-background/40 sm:w-auto sm:min-w-[180px]"
            >
              <Link href="/dashboard/my/body#report-top" scroll={false}>
                리포트 확인하기
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      <MemberCenterContactCard coach={coachContact} center={centerContact} />
    </div>
  )
}

function SummaryCard({
  title,
  icon,
  value,
  valueClassName,
  hint,
  highlighted = false,
}: {
  title: string
  icon: ReactNode
  value: string
  valueClassName?: string
  hint: string
  highlighted?: boolean
}) {
  return (
    <Card
      className={cn(
        'h-full md:h-[158px]',
        highlighted && 'border-primary/30 bg-primary/[0.04] ring-1 ring-primary/10',
      )}
    >
      <CardContent className="grid h-full min-h-[132px] grid-rows-[auto_1fr_auto] gap-0 px-3.5 py-3.5 sm:px-4 sm:py-4 md:min-h-0">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon}
          <span className="truncate">{title}</span>
        </p>
        <p
          className={cn(
            'flex items-center text-2xl font-bold leading-none tabular-nums md:text-[26px]',
            valueClassName,
          )}
        >
          {value}
        </p>
        <p className="text-xs leading-snug text-muted-foreground md:text-[13px]">
          {hint}
        </p>
      </CardContent>
    </Card>
  )
}
