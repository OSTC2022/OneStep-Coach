'use client'

import { useMemo, useState } from 'react'
import { Calendar } from 'lucide-react'
import type { MemberPortalLessonRecord } from '@/lib/member-portal-lessons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getAttendanceDisplay,
  getLessonScheduleParts,
  sortLessonsForRecentDisplay,
  type SessionPackageTally,
} from '@/lib/lesson-record-utils'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10

interface MemberLessonRecordsTableProps {
  lessons: MemberPortalLessonRecord[]
  sessionNumberByLessonId: Record<string, number>
  packageTally: SessionPackageTally
  className?: string
}

export function MemberLessonRecordsTable({
  lessons,
  sessionNumberByLessonId,
  packageTally,
  className,
}: MemberLessonRecordsTableProps) {
  const [page, setPage] = useState(1)

  const sortedLessons = useMemo(
    () => sortLessonsForRecentDisplay(lessons, sessionNumberByLessonId),
    [lessons, sessionNumberByLessonId],
  )

  const totalPages = Math.max(1, Math.ceil(sortedLessons.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedLessons = sortedLessons.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  return (
    <Card id="lesson-records" className={cn('min-w-0', className)}>
      <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
          <Calendar className="h-5 w-5 text-primary" />
          최근 수업 기록
        </CardTitle>
        {packageTally.total > 0 ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            회차 {packageTally.total}회 · 잔여 {packageTally.remaining}회
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {sortedLessons.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">수업 기록이 없습니다.</p>
        ) : (
          <>
            <div className="min-w-0 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">회차</TableHead>
                    <TableHead>날짜</TableHead>
                    <TableHead>시작</TableHead>
                    <TableHead>종료</TableHead>
                    <TableHead>강사</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>출석</TableHead>
                    <TableHead>내용</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedLessons.map((lesson) => {
                    const sessionNumber = sessionNumberByLessonId[lesson.id] ?? null
                    const isSessionOver =
                      lesson.session_deducted &&
                      sessionNumber != null &&
                      packageTally.total > 0 &&
                      sessionNumber > packageTally.total
                    const schedule = getLessonScheduleParts({
                      lessonDate: lesson.lesson_date,
                      start_time: lesson.start_time,
                      end_time: lesson.end_time,
                      lesson_session_checked_in_at:
                        lesson.lesson_sessions?.[0]?.checked_in_at,
                    })

                    return (
                      <TableRow key={lesson.id}>
                        <TableCell>
                          {lesson.session_deducted && sessionNumber != null ? (
                            <span
                              className={cn(
                                'inline-flex rounded px-1.5 py-0.5 text-xs font-semibold',
                                isSessionOver
                                  ? 'bg-destructive/15 text-destructive'
                                  : 'bg-primary/15 text-primary',
                              )}
                            >
                              {sessionNumber}회
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{schedule.date}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {schedule.start || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {schedule.end || '-'}
                        </TableCell>
                        <TableCell>{lesson.instructor?.name || '미지정'}</TableCell>
                        <TableCell>{lesson.lesson_type}</TableCell>
                        <TableCell>
                          {(() => {
                            const attendance = getAttendanceDisplay(lesson)
                            if (!attendance) {
                              return (
                                <span className="text-xs text-muted-foreground">-</span>
                              )
                            }
                            return (
                              <Badge variant={attendance.variant}>
                                {attendance.label}
                              </Badge>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {lesson.content || '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 ? (
              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  총 {sortedLessons.length}건 ·{' '}
                  {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, sortedLessons.length)}건
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    이전
                  </Button>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setPage((value) => Math.min(totalPages, value + 1))
                    }
                  >
                    다음
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
