'use client'

import { FileText, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { RunningLeagueReport } from '@/lib/types'

interface RunningLeagueMemberReportCardProps {
  report: RunningLeagueReport | null
  memberName: string
  leagueTitle: string
  showLink?: boolean
}

export function RunningLeagueMemberReportCard({
  report,
  memberName,
  leagueTitle,
  showLink = true,
}: RunningLeagueMemberReportCardProps) {
  if (!report?.is_published) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          챌린지 종료 후 코치가 확인한 요약 리포트가 이곳에 공개됩니다.
        </CardContent>
      </Card>
    )
  }

  const nextGoal = report.highlights.find((line) => line.startsWith('다음 달 추천 목표:'))
  const detailHighlights = report.highlights.filter(
    (line) => !line.startsWith('다음 달 추천 목표:') && !line.startsWith('🏅'),
  )

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          이번 달 성장 리포트
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {memberName} · {leagueTitle}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-foreground/90">{report.summary}</p>

        {detailHighlights.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border bg-background/60 px-3 py-2.5">
            {detailHighlights.map((line) => (
              <p key={line} className="text-xs text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        ) : null}

        {report.coach_comment ? (
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
            <p className="text-xs font-medium text-sky-200">코치 코멘트</p>
            <p className="mt-1 text-sm leading-relaxed">{report.coach_comment}</p>
          </div>
        ) : null}

        {nextGoal ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <div>
              <p className="text-xs font-medium text-emerald-200">다음 달 추천 목표</p>
              <p className="mt-1 text-sm">{nextGoal.replace('다음 달 추천 목표: ', '')}</p>
            </div>
          </div>
        ) : null}

        {showLink ? (
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link href="/dashboard/my/running-league/report">리포트 전체 보기</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
