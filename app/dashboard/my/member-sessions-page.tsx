'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ArrowLeft, CalendarDays, CreditCard } from 'lucide-react'
import { MemberLessonRecordsTable } from '@/components/members/member-lesson-records-table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { MemberLessonRecordsData } from '@/lib/member-portal-lessons'
import type { MemberPortalData } from '@/lib/member-portal-types'
import { formatPackageExpiryDateLabel } from '@/lib/session-package-utils'

interface MemberSessionsPageProps {
  data: MemberPortalData
  lessonRecords: MemberLessonRecordsData
}

export function MemberSessionsPage({ data, lessonRecords }: MemberSessionsPageProps) {
  const { member, nextLesson, sessionStatus } = data
  const instructorName = member.primary_instructor?.name ?? '자율배정'

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="md:hidden">
          <Link href="/dashboard/my" aria-label="홈으로">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">수업권 · 수업 기록</h1>
          <p className="text-sm text-muted-foreground">
            남은 수업과 최근 수업 기록을 확인합니다. (조회 전용)
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              {sessionStatus.kind === 'monthly' ? '남은 기간' : '남은 수업'}
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {sessionStatus.kind === 'monthly'
                ? sessionStatus.remainingPeriodLabel
                : `${sessionStatus.remainingSessions ?? 0}회`}
            </p>
            {sessionStatus.kind === 'monthly' && sessionStatus.expiresAt ? (
              <p className="text-xs text-muted-foreground">
                만료일 {formatPackageExpiryDateLabel(sessionStatus.expiresAt)}
              </p>
            ) : null}
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

      <MemberLessonRecordsTable
        lessons={lessonRecords.lessons}
        sessionNumberByLessonId={lessonRecords.sessionNumberByLessonId}
        packageTally={lessonRecords.packageTally}
      />
    </div>
  )
}
