'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  addRunningLeagueParticipant,
  deleteRunningLeague,
  getRunningLeagueDetail,
  updateRunningLeague,
} from '@/lib/actions/running-league'
import { SCORE_WEIGHTS } from '@/lib/running-league-content'
import {
  RUNNING_LEAGUE_STATUS_LABELS,
  statusBadgeClass,
  targetGroupLabel,
} from '@/lib/running-league/constants'
import type { MemberPickerOption } from '@/lib/actions/members'
import type { RunningLeague } from '@/lib/types'
import { RecoveryAlertsPanel } from '@/components/running-league/recovery-alerts-panel'
import { RunningLeagueLeaderboard } from '@/components/running-league/running-league-leaderboard'
import { AddParticipantCard } from '@/components/settings/running-league/add-participant-card'
import { RunningLeagueAwardsPanel } from '@/components/settings/running-league/running-league-awards-panel'
import {
  RunningLeagueForm,
  leagueToFormValues,
  type RunningLeagueFormValues,
} from '@/components/settings/running-league/running-league-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ParticipantEditor } from '@/components/settings/running-league/participant-editor'
import { cn } from '@/lib/utils'

const DETAIL_SECTIONS = [
  { id: 'league-info', label: '챌린지 정보' },
  { id: 'add-participant', label: '참가 추가' },
  { id: 'leaderboard', label: '순위표' },
  { id: 'awards', label: '수상' },
  { id: 'participants', label: '참가자 관리' },
] as const

interface RunningLeagueDetailViewProps {
  league: RunningLeague
  members: MemberPickerOption[]
  initialDetail: Awaited<ReturnType<typeof getRunningLeagueDetail>>
}

function formatDate(value: string): string {
  try {
    return format(parseISO(value), 'yyyy년 M월 d일', { locale: ko })
  } catch {
    return value
  }
}

export function RunningLeagueDetailView({
  league,
  members,
  initialDetail,
}: RunningLeagueDetailViewProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [detail, setDetail] = useState(initialDetail)
  const [form, setForm] = useState<RunningLeagueFormValues>(leagueToFormValues(league))

  const disabledMemberIds = useMemo(
    () => detail.participants.map((row) => row.member_id),
    [detail.participants],
  )

  const reportsByParticipant = useMemo(() => {
    const map = new Map<string, (typeof detail.reports)[number]>()
    for (const report of detail.reports) {
      map.set(report.participant_id, report)
    }
    return map
  }, [detail.reports])

  function refresh() {
    startTransition(async () => {
      const next = await getRunningLeagueDetail(league.id)
      setDetail(next)
      if (next.league) {
        setForm(leagueToFormValues(next.league))
      }
      router.refresh()
    })
  }

  function saveLeague() {
    startTransition(async () => {
      const result = await updateRunningLeague(league.id, form)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('챌린지 정보를 저장했습니다.')
      refresh()
    })
  }

  function addParticipant(input: {
    member_id: string
    goal_level: string
    goal_type: string
    personal_goal: string
    goal_achievement_rate: number
  }) {
    if (!input.member_id) {
      toast.error('참가 회원을 선택해주세요.')
      return
    }
    startTransition(async () => {
      const result = await addRunningLeagueParticipant({
        league_id: league.id,
        member_id: input.member_id,
        goal_level: input.goal_level,
        goal_type: input.goal_type as Parameters<typeof addRunningLeagueParticipant>[0]['goal_type'],
        personal_goal: input.personal_goal,
        goal_achievement_rate: input.goal_achievement_rate,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('참가자를 추가했습니다.')
      refresh()
    })
  }

  function removeLeague() {
    if (!window.confirm('이 챌린지를 삭제할까요? 참가자·점수도 함께 삭제됩니다.')) return
    startTransition(async () => {
      const result = await deleteRunningLeague(league.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('챌린지를 삭제했습니다.')
      router.push('/dashboard/settings/running-league')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="ghost" size="sm" className="w-fit px-2">
          <Link href="/dashboard/settings/running-league">
            <ArrowLeft className="mr-1 h-4 w-4" />
            챌린지 목록
          </Link>
        </Button>
        <span
          className={cn(
            'w-fit rounded-full border px-3 py-1 text-xs font-medium',
            statusBadgeClass(league.status),
          )}
        >
          {RUNNING_LEAGUE_STATUS_LABELS[league.status]}
        </span>
      </div>

      <Card id="league-info" className="scroll-mt-20">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg sm:text-xl">{league.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {formatDate(league.starts_at)} ~ {formatDate(league.ends_at)} · 대상:{' '}
            {targetGroupLabel(league.target_group)}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <RunningLeagueForm value={form} onChange={setForm} idPrefix="detail" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveLeague} disabled={pending}>
              {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              챌린지 저장
            </Button>
            <Button type="button" variant="destructive" onClick={removeLeague} disabled={pending}>
              삭제
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {SCORE_WEIGHTS.map((item) => (
          <span key={item.item} className="rounded-full bg-muted px-2.5 py-1">
            {item.item} {item.ratio}
          </span>
        ))}
      </div>

      <nav className="sticky top-0 z-10 -mx-1 flex gap-2 overflow-x-auto rounded-lg border bg-background/95 px-2 py-2 backdrop-blur sm:hidden">
        {DETAIL_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <Card id="add-participant" className="scroll-mt-20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" />
            참가 회원 추가
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AddParticipantCard
            members={members}
            disabledMemberIds={disabledMemberIds}
            pending={pending}
            onAdd={addParticipant}
          />
        </CardContent>
      </Card>

      <RecoveryAlertsPanel
        participants={detail.participants}
        dailyRecoveries={detail.dailyRecoveries}
      />

      <RunningLeagueLeaderboard
        id="leaderboard"
        rows={detail.leaderboard}
        title="순위표"
        className="scroll-mt-20"
      />

      <div id="awards" className="scroll-mt-20">
        <RunningLeagueAwardsPanel
        key={detail.awardSlots.map((slot) => `${slot.award_key}-${slot.memberId}-${slot.is_confirmed}`).join('|')}
        leagueId={league.id}
        participants={detail.participants}
        initialSlots={detail.awardSlots}
        onUpdated={refresh}
        />
      </div>

      <div id="participants" className="scroll-mt-20 space-y-4">
        <h3 className="text-sm font-semibold">참가자 관리 ({detail.participants.length}명)</h3>
        {detail.participants.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              참가 회원을 추가하면 목표·출석·기록·마일리지·회복·리포트를 관리할 수 있습니다.
            </CardContent>
          </Card>
        ) : (
          detail.participants.map((participant) => (
            <ParticipantEditor
              key={participant.id}
              participant={participant}
              records={detail.records}
              dailyRecoveries={detail.dailyRecoveries}
              report={reportsByParticipant.get(participant.id) ?? null}
              onUpdated={refresh}
              onRemoved={refresh}
            />
          ))
        )}
      </div>
    </div>
  )
}
