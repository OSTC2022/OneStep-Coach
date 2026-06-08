'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ArrowLeft, CalendarDays, CreditCard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { MemberPortalData } from '@/lib/member-portal-types'

const STATUS_LABEL: Record<string, string> = {
  present: '출석',
  absent: '결석',
  makeup: '보강',
  cancelled: '취소',
  scheduled: '예정',
}

interface MemberSessionsPageProps {
  data: MemberPortalData
}

export function MemberSessionsPage({ data }: MemberSessionsPageProps) {
  const { member, nextLesson, recentSessions, recentLessons } = data
  const instructorName = member.primary_instructor?.name ?? '자율배정'
  const attendanceItems =
    recentSessions.length > 0
      ? recentSessions
      : recentLessons.filter((lesson) => lesson.attendance_status !== 'scheduled')

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="md:hidden">
          <Link href="/dashboard/my" aria-label="홈으로">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">수업</h1>
          <p className="text-sm text-muted-foreground">남은 수업과 출석 일정을 확인합니다.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              남은 수업
            </p>
            <p className="text-2xl font-bold tabular-nums">{member.remaining_sessions ?? 0}회</p>
          </CardContent>
        </Card>

        <Card className="border-primary/15 bg-primary/5">
          <CardContent className="space-y-1 p-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              다음 수업
            </p>
            {nextLesson ? (
              <>
                <p className="text-lg font-bold">
                  {format(parseISO(nextLesson.lesson_date), 'M월 d일 (EEE)', { locale: ko })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {nextLesson.start_time?.slice(0, 5) ?? '시간 미정'} ·{' '}
                  {nextLesson.instructor?.name ?? instructorName}
                </p>
              </>
            ) : (
              <p className="text-lg font-semibold text-muted-foreground">예정된 수업 없음</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">최근 출석</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {attendanceItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">출석 기록이 없습니다.</p>
          ) : (
            attendanceItems.slice(0, 8).map((item) => {
              const date =
                'session_date' in item ? item.session_date : item.lesson_date
              const status =
                'status' in item ? item.status : item.attendance_status

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <p className="text-sm font-medium">
                    {format(parseISO(date), 'M/d (EEE)', { locale: ko })}
                  </p>
                  <Badge variant="secondary">{STATUS_LABEL[status] ?? status}</Badge>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
