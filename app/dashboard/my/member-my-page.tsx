'use client'

import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarDays, Clock, User, CreditCard, History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { MemberPortalData } from '@/lib/actions/member-portal'

const STATUS_LABEL: Record<string, string> = {
  present: '출석',
  absent: '결석',
  makeup: '보강',
  cancelled: '취소',
  scheduled: '예정',
}

interface MemberMyPageProps {
  data: MemberPortalData
}

export function MemberMyPage({ data }: MemberMyPageProps) {
  const { member, nextLesson, recentLessons, recentSessions, transactions } = data

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">마이페이지</h1>
        <p className="text-sm text-muted-foreground">
          {member.name}님 · 남은 수업 {member.remaining_sessions ?? 0}회
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              남은 수업
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold tabular-nums">
              {member.remaining_sessions ?? 0}
              <span className="ml-1 text-lg font-normal text-muted-foreground">회</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              담당 강사
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {member.primary_instructor?.name ?? '자율배정'}
            </p>
            {member.sport && (
              <p className="text-sm text-muted-foreground">{member.sport}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            다음 수업
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nextLesson ? (
            <div className="space-y-1">
              <p className="font-medium">
                {format(new Date(`${nextLesson.lesson_date}T12:00:00`), 'M월 d일 (EEE)', {
                  locale: ko,
                })}
                {nextLesson.start_time && (
                  <span className="ml-2 text-muted-foreground">
                    {nextLesson.start_time.slice(0, 5)}
                    {nextLesson.end_time ? ` – ${nextLesson.end_time.slice(0, 5)}` : ''}
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {nextLesson.instructor?.name ?? '담당 강사 미정'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">예정된 수업이 없습니다.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            최근 수업 기록
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentSessions.length === 0 && recentLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">수업 기록이 없습니다.</p>
          ) : (
            (recentSessions.length > 0 ? recentSessions : recentLessons).slice(0, 8).map((item) => {
              const date =
                'session_date' in item
                  ? item.session_date
                  : item.lesson_date
              const status =
                'status' in item ? item.status : item.attendance_status
              const time =
                'lesson' in item && item.lesson?.start_time
                  ? item.lesson.start_time.slice(0, 5)
                  : 'start_time' in item && item.start_time
                    ? item.start_time.slice(0, 5)
                    : null

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {format(new Date(`${date}T12:00:00`), 'M/d (EEE)', { locale: ko })}
                      {time && (
                        <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {time}
                        </span>
                      )}
                    </p>
                  </div>
                  <Badge variant="secondary">{STATUS_LABEL[status] ?? status}</Badge>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">회차 내역</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">
                  {format(new Date(tx.created_at), 'M/d HH:mm', { locale: ko })}
                  {' · '}
                  {tx.reason}
                </span>
                <span className={tx.delta > 0 ? 'text-green-400' : 'text-red-400'}>
                  {tx.delta > 0 ? '+' : ''}
                  {tx.delta}회 → {tx.balance_after}회
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
