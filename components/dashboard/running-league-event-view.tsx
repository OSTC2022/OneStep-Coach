'use client'

import type { ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Award, CalendarRange, Flag, Target, Trophy } from 'lucide-react'
import {
  ATTENDANCE_SCORES,
  AWARD_CATEGORIES,
  GOAL_ACHIEVEMENT_SCORES,
  GOAL_LEVELS,
  LEAGUE_PURPOSES,
  MILEAGE_SCORES,
  RECOVERY_CHECKS,
  RECORD_TEST_OPTIONS,
  REWARD_SUGGESTIONS,
  RUNNING_LEAGUE_EN,
  RUNNING_LEAGUE_INTRO,
  RUNNING_LEAGUE_KEY_MESSAGE,
  RUNNING_LEAGUE_NAME,
  RUNNING_LEAGUE_TAGLINE,
  SCORE_WEIGHTS,
  SUB_EVENTS,
  WEEKLY_PLAN,
  formatLeaguePeriodLabel,
} from '@/lib/running-league-content'
import type { CenterBoardPost } from '@/lib/types'
import { cn } from '@/lib/utils'

function ScoreTable({
  headers,
  rows,
}: {
  headers: [string, string]
  rows: ReadonlyArray<{ a: string; b: string }>
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/70">
      <table className="w-full min-w-[14rem] text-left text-[11px]">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-medium">{headers[0]}</th>
            <th className="px-2 py-1.5 font-medium">{headers[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.a} className="border-t border-border/50">
              <td className="px-2 py-1.5 text-foreground/90">{row.a}</td>
              <td className="px-2 py-1.5 font-medium text-primary">{row.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string
  icon?: typeof Trophy
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details
      className="group rounded-md border border-border/60 bg-muted/10"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
        {title}
        <span className="ml-auto text-[10px] font-normal text-muted-foreground group-open:hidden">
          펼치기
        </span>
      </summary>
      <div className="space-y-2 border-t border-border/50 px-2.5 py-2.5">{children}</div>
    </details>
  )
}

interface RunningLeagueEventViewProps {
  post: CenterBoardPost
  className?: string
}

export function RunningLeagueEventView({ post, className }: RunningLeagueEventViewProps) {
  const period = formatLeaguePeriodLabel(post.event_starts_at, post.event_ends_at)
  const monthMatch = /(\d{1,2})월/.exec(post.title)
  const monthLabel = monthMatch ? `${monthMatch[1]}월` : undefined

  return (
    <div className={cn('space-y-3', className)}>
      <div className="rounded-lg border border-primary/35 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          {RUNNING_LEAGUE_EN}
        </p>
        <h3 className="mt-1 text-base font-bold leading-snug text-foreground">
          {post.title || RUNNING_LEAGUE_NAME}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-foreground/85">
          {RUNNING_LEAGUE_TAGLINE}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5">
            <CalendarRange className="h-3 w-3" />
            {period}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5">
            <Flag className="h-3 w-3" />
            성인 러닝 회원 전체
          </span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-foreground/90">{RUNNING_LEAGUE_INTRO}</p>

      {post.body ? (
        <p className="rounded-md border border-border/50 bg-muted/15 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
          {post.body}
        </p>
      ) : null}

      <Section title="리그 목적" icon={Target} defaultOpen>
        <ul className="list-inside list-disc space-y-0.5 text-[11px] text-foreground/85">
          {LEAGUE_PURPOSES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section title="점수 구조 (총 100%)" icon={Trophy} defaultOpen>
        <ScoreTable
          headers={['항목', '비율']}
          rows={SCORE_WEIGHTS.map((r) => ({ a: r.item, b: r.ratio }))}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          거리만 높은 점수를 주면 부상 위험이 있습니다. 출석·목표·회복을 함께 반영합니다.
        </p>
      </Section>

      <Section title="1) 출석 점수">
        <ScoreTable
          headers={['기준', '점수']}
          rows={ATTENDANCE_SCORES.map((r) => ({ a: r.criteria, b: r.points }))}
        />
      </Section>

      <Section title="2) 개인 목표 달성">
        <ScoreTable
          headers={['레벨', '목표 예시']}
          rows={GOAL_LEVELS.map((r) => ({ a: r.level, b: r.goal }))}
        />
        <ScoreTable
          headers={['달성률', '점수']}
          rows={GOAL_ACHIEVEMENT_SCORES.map((r) => ({ a: r.rate, b: r.points }))}
        />
      </Section>

      <Section title="3) 기록 향상">
        <ScoreTable
          headers={['종목', '추천 대상']}
          rows={RECORD_TEST_OPTIONS.map((r) => ({ a: r.event, b: r.target }))}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          1주차 기준 기록 측정 → 4주차 재측정. 최고 기록상과 최다 향상상을 분리 시상합니다.
        </p>
      </Section>

      <Section title="4) 러닝 마일리지 (15%)">
        <ScoreTable
          headers={['월 누적 거리', '점수']}
          rows={MILEAGE_SCORES.map((r) => ({ a: r.distance, b: r.points }))}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          80km 이상은 만점 처리. 이후 거리는 순위 표시만 하고 추가 점수는 없습니다.
        </p>
      </Section>

      <Section title="5) 회복관리 / 스트레칭">
        <ScoreTable
          headers={['체크 항목', '점수']}
          rows={RECOVERY_CHECKS.map((r) => ({ a: r.item, b: r.points }))}
        />
      </Section>

      <Section title="4주 운영 일정" icon={CalendarRange} defaultOpen>
        <div className="space-y-2">
          {WEEKLY_PLAN.map((week) => (
            <div
              key={week.week}
              className="rounded-md border border-border/50 bg-background/40 px-2 py-2"
            >
              <p className="text-xs font-semibold text-primary">
                {week.week} · {week.title}
              </p>
              <p className="mt-0.5 text-[11px] text-foreground/85">{week.focus}</p>
              <p className="mt-1 text-[10px] font-medium text-foreground">
                미션: {week.mission}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                {week.coachNote}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="시상 부문" icon={Award} defaultOpen>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {AWARD_CATEGORIES.map((item) => (
            <div
              key={item.name}
              className="rounded-md border border-border/50 bg-background/30 px-2 py-1.5"
            >
              <p className="text-[11px] font-semibold text-foreground">{item.name}</p>
              <p className="text-[10px] text-muted-foreground">{item.criteria}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="추천 보상">
        <ScoreTable
          headers={['부문', '보상']}
          rows={REWARD_SUGGESTIONS.map((r) => ({ a: r.award, b: r.reward }))}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          원스텝 러닝 인증서 + 인스타 카드뉴스 + 1회 보강권 조합을 추천합니다.
        </p>
      </Section>

      <Section title="함께 운영 가능한 이벤트">
        <ul className="space-y-1.5">
          {SUB_EVENTS.map((event) => (
            <li
              key={event.name}
              className="rounded-md border border-border/40 px-2 py-1.5 text-[11px]"
            >
              <span className="font-semibold text-foreground">{event.name}</span>
              <span className="mt-0.5 block text-muted-foreground">{event.summary}</span>
            </li>
          ))}
        </ul>
      </Section>

      <blockquote className="rounded-md border-l-4 border-primary bg-primary/5 px-3 py-2 text-xs font-medium leading-relaxed text-foreground">
        {RUNNING_LEAGUE_KEY_MESSAGE}
      </blockquote>

      {post.event_starts_at ? (
        <p className="text-[10px] text-muted-foreground">
          등록:{' '}
          {format(parseISO(post.created_at), 'M월 d일 HH:mm', { locale: ko })}
          {monthLabel ? ` · ${monthLabel} 리그` : ''}
        </p>
      ) : null}
    </div>
  )
}
