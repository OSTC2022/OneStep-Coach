'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import {
  Activity,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  Flag,
  MapPin,
  User,
} from 'lucide-react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { PortalBrandTitleLockup } from '@/components/dashboard/member-portal-hero-shell'
import { MemberPortalAccordionMenus } from '@/components/dashboard/member-portal-accordion-menus'
import { MemberRunningLeagueTrainingSchedule } from '@/components/dashboard/member-running-league-training-schedule'
import { YouthAthleticsPbPanel } from '@/components/dashboard/youth-athletics-pb-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CenterRunningTrainingScheduleBundle } from '@/lib/actions/center-running-training-schedule'
import type { YouthAthleticsPbBundle } from '@/lib/actions/youth-athletics-pb'
import { BRAND_PULSE_GREEN } from '@/lib/brand-pulse-svg'
import type { MemberPortalData } from '@/lib/member-portal-types'
import { portalStatusToneClass } from '@/lib/member-portal-status'
import { formatPackageExpiryDateLabel } from '@/lib/session-package-utils'
import {
  YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL,
  YOUTH_ATHLETICS_PORTAL_TITLE,
} from '@/lib/youth-athletics-class'
import {
  formatYouthAthleticsPrimaryEventsLabel,
  formatYouthAthleticsRemainingDday,
} from '@/lib/youth-athletics-events'
import { cn } from '@/lib/utils'

type YouthAthleticsPortalProps = {
  data: MemberPortalData
  centerTrainingSchedule?: CenterRunningTrainingScheduleBundle | null
  pbBundle?: YouthAthleticsPbBundle | null
  adminPreview?: boolean
  /** 관리자·강사 — 마감 후 대리 참여 */
  canStaffProxySignup?: boolean
}

export function YouthAthleticsPortal({
  data,
  centerTrainingSchedule = null,
  pbBundle = null,
  adminPreview = false,
  canStaffProxySignup = false,
}: YouthAthleticsPortalProps) {
  const { member, summary, sessionStatus } = data
  const instructorName = member.primary_instructor?.name ?? '자율배정'
  const days = centerTrainingSchedule?.days
  const previousWeekDays = centerTrainingSchedule?.previousWeekDays
  const nextWeekDays = centerTrainingSchedule?.nextWeekDays
  const tableReady = centerTrainingSchedule?.tableReady ?? true
  const visibleDays = (days ?? []).filter((day) => !day.is_hidden)
  const schoolLine = [member.school, member.grade].filter((value) => value?.trim()).join(' · ')
  const [primaryEvent1, setPrimaryEvent1] = useState(pbBundle?.primaryEvent1 ?? null)
  const [primaryEvent2, setPrimaryEvent2] = useState(pbBundle?.primaryEvent2 ?? null)

  const primaryEventLabel = useMemo(
    () => formatYouthAthleticsPrimaryEventsLabel(primaryEvent1, primaryEvent2),
    [primaryEvent1, primaryEvent2],
  )

  const daysUntilExpiry =
    sessionStatus.kind === 'monthly' ? sessionStatus.daysUntilExpiry : null
  const remainingLabel = formatYouthAthleticsRemainingDday(daysUntilExpiry)
  const remainingHint =
    sessionStatus.kind === 'monthly'
      ? sessionStatus.expiresAt
        ? `만료일 ${formatPackageExpiryDateLabel(sessionStatus.expiresAt)}`
        : '만료일 미지정'
      : '기간권 등록 시 디데이로 표시'

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-4 sm:space-y-5">
      <section className="relative isolate overflow-hidden rounded-[1.35rem] border border-[#AAFF00]/30 bg-[#070807] px-4 py-6 shadow-[0_0_0_1px_rgba(170,255,0,0.06),0_20px_60px_rgba(0,0,0,0.55)] sm:px-7 sm:py-8">
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 top-[-40%] h-[140%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(170,255,0,0.16)_0%,transparent_68%)] blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 bottom-[-30%] h-[90%] w-[55%] rounded-full bg-[radial-gradient(circle,rgba(170,255,0,0.1)_0%,transparent_70%)] blur-3xl"
        />

        {/* perspective lane field */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[62%] origin-left opacity-40 [transform:perspective(700px)_rotateY(18deg)]"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 16px, ${BRAND_PULSE_GREEN}55 16px, ${BRAND_PULSE_GREEN}55 17px)`,
            maskImage:
              'linear-gradient(90deg, black 8%, black 50%, transparent 95%), linear-gradient(180deg, transparent, black 18%, black 82%, transparent)',
            WebkitMaskImage:
              'linear-gradient(90deg, black 8%, black 50%, transparent 95%), linear-gradient(180deg, transparent, black 18%, black 82%, transparent)',
            maskComposite: 'intersect',
            WebkitMaskComposite: 'source-in',
          }}
        />

        {/* track curve + moving pulse dash */}
        <svg
          aria-hidden
          className="pointer-events-none absolute -left-[12%] top-1/2 h-[175%] w-[95%] -translate-y-1/2"
          viewBox="0 0 420 420"
          fill="none"
        >
          <defs>
            <linearGradient id="youth-track-glow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={BRAND_PULSE_GREEN} stopOpacity="0.05" />
              <stop offset="45%" stopColor={BRAND_PULSE_GREEN} stopOpacity="0.75" />
              <stop offset="100%" stopColor={BRAND_PULSE_GREEN} stopOpacity="0.1" />
            </linearGradient>
            <filter id="youth-track-soft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M48 48 C 230 48, 372 128, 372 210 C 372 292, 230 372, 48 372"
            stroke="url(#youth-track-glow)"
            strokeWidth="18"
            strokeLinecap="round"
            opacity="0.55"
            filter="url(#youth-track-soft)"
          />
          <path
            d="M78 78 C 220 78, 332 138, 332 210 C 332 282, 220 342, 78 342"
            className="youth-track-dash-flow"
            stroke={BRAND_PULSE_GREEN}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.4"
          />
          <path
            d="M108 108 C 210 108, 292 148, 292 210 C 292 272, 210 312, 108 312"
            className="youth-track-dash-flow"
            stroke={BRAND_PULSE_GREEN}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.85"
            style={{ animationDelay: '-1s' }}
          />
        </svg>

        {/* watermark pulse */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 top-1/2 -translate-y-1/2 opacity-[0.18] sm:-right-3 sm:opacity-[0.22]"
        >
          <div className="onestep-heartbeat">
            <BrandPulseAppIcon glow className="h-40 w-40 sm:h-52 sm:w-52" />
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#070807]/20 via-[#070807]/75 to-[#070807]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#AAFF00]/55 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#AAFF00]/25 to-transparent"
        />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#AAFF00] sm:text-[11px]">
              TRACK CLASS
            </p>
            <span className="h-1 w-1 rounded-full bg-[#AAFF00]/80" />
            <p className="text-[10px] font-semibold tracking-[0.18em] text-[#AAFF00]/80 sm:text-[11px]">
              {YOUTH_ATHLETICS_PORTAL_LEAGUE_LABEL}
            </p>
          </div>

          <div className="mt-2">
            <PortalBrandTitleLockup
              title={YOUTH_ATHLETICS_PORTAL_TITLE}
              className="text-[1.65rem] font-black text-white sm:text-[2.1rem]"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-xl font-black tracking-tight text-white sm:text-2xl">
              {member.name}
            </p>
            <span className="text-sm font-semibold text-[#AAFF00]">선수</span>
            {primaryEventLabel ? (
              <span className="inline-flex items-center rounded-full border border-[#AAFF00]/35 bg-[#AAFF00]/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#AAFF00] sm:text-sm">
                {primaryEventLabel}
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] sm:text-xs">
            <InfoChip icon={<User className="h-3 w-3" />} label={`코치 ${instructorName}`} />
            {member.sport ? <InfoChip label={member.sport} /> : null}
            {schoolLine ? <InfoChip label={schoolLine} /> : null}
          </div>
        </div>
      </section>

      {visibleDays.length > 0 ? (
        <section className="overflow-x-auto">
          <div className="flex min-w-full gap-2 sm:grid sm:grid-cols-7">
            {visibleDays.map((day) => (
              <div
                key={day.id}
                className={cn(
                  'min-w-[5.5rem] flex-1 rounded-xl border px-2.5 py-2 sm:min-w-0',
                  day.is_signed_up
                    ? 'border-[#AAFF00]/70 bg-[#AAFF00]/12'
                    : 'border-[#AAFF00]/20 bg-[#0a0c0a]/80',
                )}
              >
                <p className="text-[11px] font-semibold text-[#AAFF00]">
                  {day.weekday_label}요일
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-foreground/90">
                  {day.training_summary.trim() || '훈련 미정'}
                </p>
                {day.location_label.trim() ? (
                  <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    {day.location_label}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <MemberPortalAccordionMenus
        trainingLabel="육상선수반 스케줄"
        training={
          <MemberRunningLeagueTrainingSchedule
            days={days}
            previousWeekDays={previousWeekDays}
            nextWeekDays={nextWeekDays}
            tableReady={tableReady}
            canParticipate={!adminPreview}
            readOnly={adminPreview && !canStaffProxySignup}
            canStaffProxySignup={canStaffProxySignup}
            embedded
            contentOnly
            title="육상선수반 스케줄"
          />
        }
      />

      {pbBundle ? (
        <YouthAthleticsPbPanel
          initial={pbBundle}
          readOnly={adminPreview}
          onPrimaryEventsChange={(next) => {
            setPrimaryEvent1(next.event1)
            setPrimaryEvent2(next.event2)
          }}
        />
      ) : null}

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          icon={<CreditCard className="h-3.5 w-3.5" />}
          label="디데이"
          value={remainingLabel}
          hint={remainingHint}
          tone={
            daysUntilExpiry != null && daysUntilExpiry <= 7
              ? 'warn'
              : daysUntilExpiry != null
                ? 'ok'
                : 'warn'
          }
        />
        <StatTile
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label="최근 출석일"
          value={
            summary.recentAttendanceDate
              ? format(parseISO(summary.recentAttendanceDate), 'M/d')
              : '기록 없음'
          }
          hint="선수반 출석 기준"
        />
        <StatTile
          icon={<Activity className="h-3.5 w-3.5" />}
          label="최근 컨디션"
          value={summary.recentCondition.label}
          hint={summary.recentCondition.hint}
          className={portalStatusToneClass(summary.recentCondition.tone)}
        />
        <StatTile
          icon={<ClipboardCheck className="h-3.5 w-3.5" />}
          label="오늘 기록"
          value={summary.todayRecorded ? '완료' : '입력 필요'}
          hint={summary.todayRecorded ? '오늘 상태 저장됨' : '훈련 전 상태 체크'}
          tone={summary.todayRecorded ? 'ok' : 'warn'}
        />
      </section>

      <Card className="border-[#AAFF00]/30 bg-gradient-to-r from-[#AAFF00]/12 to-transparent">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Flag className="h-4 w-4 text-[#AAFF00]" />
              트랙 훈련 전 상태 체크
            </p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              수면·피로·컨디션을 남기면 코치가 인터벌·근력 강도를 조절합니다.
            </p>
          </div>
          <Button
            asChild
            className="min-h-11 w-full bg-[#AAFF00] text-black hover:bg-[#c8ff4d] sm:w-auto"
          >
            <Link href="/dashboard/my/body#today-record" scroll={false}>
              {summary.todayRecorded ? '기록 수정하기' : '상태 입력하기'}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function InfoChip({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#AAFF00]/30 bg-black/60 px-2.5 py-1 font-medium text-[#e8ffb0] backdrop-blur-sm">
      {icon}
      {label}
    </span>
  )
}

function StatTile({
  icon,
  label,
  value,
  hint,
  tone,
  className,
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
  tone?: 'ok' | 'warn'
  className?: string
}) {
  return (
    <Card className="border-[#AAFF00]/20 bg-[#0a0c0a]/90">
      <CardContent className="space-y-1.5 p-3 sm:p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          {icon}
          {label}
        </p>
        <p
          className={cn(
            'text-lg font-bold leading-none tabular-nums sm:text-xl',
            tone === 'ok' && 'text-[#AAFF00]',
            tone === 'warn' && 'text-amber-300',
            className,
          )}
        >
          {value}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
