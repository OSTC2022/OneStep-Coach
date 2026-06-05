'use client'

import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  formatLessonScheduleLabel,
  formatSignedAtTime,
  formatTimeValue,
  getAttendanceDisplay,
  resolveLessonEndTimeLabel,
} from '@/lib/lesson-record-utils'

export type MemberLessonRecord = {
  id: string
  lesson_date: string
  start_time: string | null
  end_time: string | null
  lesson_type: string
  attendance_status: string
  content: string | null
  special_note: string | null
  session_deducted: boolean
  created_at?: string
  instructor?: { id: string; name: string } | null
  signature?: { id: string; signature_data: string; signed_at: string } | null
  lesson_sessions?: { checked_in_at: string | null; signature_data: string | null }[] | null
}

interface LessonRecordDetailDialogProps {
  lesson: MemberLessonRecord | null
  sessionNumber: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function resolveSignatureData(lesson: MemberLessonRecord) {
  return (
    lesson.signature?.signature_data ??
    lesson.lesson_sessions?.[0]?.signature_data ??
    null
  )
}

export function LessonRecordDetailDialog({
  lesson,
  sessionNumber,
  open,
  onOpenChange,
}: LessonRecordDetailDialogProps) {
  if (!lesson) return null

  const endTimeLabel = resolveLessonEndTimeLabel({
    end_time: lesson.end_time,
    signature_signed_at: lesson.signature?.signed_at,
    lesson_session_checked_in_at: lesson.lesson_sessions?.[0]?.checked_in_at,
  })
  const dateLabel = formatLessonScheduleLabel({
    lessonDate: lesson.lesson_date,
    start_time: lesson.start_time,
    end_time: lesson.end_time,
    signature_signed_at: lesson.signature?.signed_at,
    lesson_session_checked_in_at: lesson.lesson_sessions?.[0]?.checked_in_at,
  })
  const startTime = formatTimeValue(lesson.start_time)
  const signedAt = lesson.signature?.signed_at
    ? formatSignedAtTime(lesson.signature.signed_at)
    : null
  const signatureData = resolveSignatureData(lesson)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {sessionNumber != null ? `${sessionNumber}회 ` : ''}
            수업 상세
          </DialogTitle>
          <DialogDescription>{dateLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-muted-foreground">강사</p>
              <p className="font-medium">{lesson.instructor?.name || '미지정'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">유형</p>
              <p className="font-medium">{lesson.lesson_type}</p>
            </div>
            <div>
              <p className="text-muted-foreground">시작</p>
              <p className="font-medium">{startTime || '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">종료</p>
              <p className="font-medium">
                {endTimeLabel || '-'}
                {signedAt && endTimeLabel !== signedAt ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (서명 {signedAt})
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">출석</span>
            {(() => {
              const attendance = getAttendanceDisplay(lesson)
              if (!attendance) {
                return <span className="text-sm text-muted-foreground">-</span>
              }
              return <Badge variant={attendance.variant}>{attendance.label}</Badge>
            })()}
            {lesson.session_deducted && (
              <Badge variant="outline">세션 차감 완료</Badge>
            )}
          </div>

          {(lesson.content || lesson.special_note) && (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              {lesson.content && (
                <div>
                  <p className="text-muted-foreground">내용</p>
                  <p className="whitespace-pre-wrap">{lesson.content}</p>
                </div>
              )}
              {lesson.special_note && (
                <div>
                  <p className="text-muted-foreground">특이사항</p>
                  <p className="whitespace-pre-wrap">{lesson.special_note}</p>
                </div>
              )}
            </div>
          )}

          {signatureData && (
            <div>
              <p className="mb-2 text-muted-foreground">서명</p>
              <div className="overflow-hidden rounded-md border border-border bg-[#1B2838]">
                <Image
                  src={signatureData}
                  alt="수업 서명"
                  width={480}
                  height={180}
                  unoptimized
                  className="h-auto w-full"
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
