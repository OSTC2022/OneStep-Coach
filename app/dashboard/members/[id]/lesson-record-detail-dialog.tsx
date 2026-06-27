'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { updateLessonRecord } from '@/lib/actions/lesson-sessions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InstructorSelectField } from '@/components/members/instructor-select-field'
import {
  formatLessonScheduleLabel,
  formatSignedAtTime,
  formatTimeValue,
  getAttendanceDisplay,
  resolveLessonEndTimeLabel,
} from '@/lib/lesson-record-utils'
import { AUTO_INSTRUCTOR_ID } from '@/lib/member-utils'
import { LESSON_TYPE_OPTIONS, normalizeLessonType } from '@/lib/lesson-types'
import { formatPackagePlanLabel } from '@/lib/session-package-utils'
import { pickSessionPackageIdForDeduction } from '@/lib/session-package-deduction'
import type { SessionPackage } from '@/lib/types'

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
  instructor_id?: string | null
  session_package_id?: string | null
  created_at?: string
  instructor?: { id: string; name: string } | null
  signature?: { id: string; signature_data: string; signed_at: string } | null
  lesson_sessions?: { checked_in_at: string | null; signature_data: string | null }[] | null
}

type InstructorOption = {
  id: string
  name: string
  calendar_color?: string | null
}

interface LessonRecordDetailDialogProps {
  lesson: MemberLessonRecord | null
  sessionNumber: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  instructors?: InstructorOption[]
  sessionPackages?: SessionPackage[]
  canEdit?: boolean
  onUpdated?: (lesson: MemberLessonRecord) => void
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
  instructors = [],
  sessionPackages = [],
  canEdit = false,
  onUpdated,
}: LessonRecordDetailDialogProps) {
  const [editing, setEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [instructorId, setInstructorId] = useState(AUTO_INSTRUCTOR_ID)
  const [lessonType, setLessonType] = useState('개인레슨')
  const [sessionPackageId, setSessionPackageId] = useState('')
  const prevInstructorRef = useRef('')

  useEffect(() => {
    if (!open) {
      setEditing(false)
      return
    }
    if (!lesson) return
    const nextInstructorId =
      lesson.instructor_id || lesson.instructor?.id || AUTO_INSTRUCTOR_ID
    setInstructorId(nextInstructorId)
    setLessonType(normalizeLessonType(lesson.lesson_type))
    setSessionPackageId(lesson.session_package_id ?? '')
    prevInstructorRef.current = nextInstructorId
  }, [open, lesson])

  useEffect(() => {
    if (!editing || !open || sessionPackages.length === 0) return
    if (prevInstructorRef.current === instructorId) return
    prevInstructorRef.current = instructorId
    const picked = pickSessionPackageIdForDeduction(sessionPackages)
    if (picked) setSessionPackageId(picked)
  }, [editing, open, instructorId, sessionPackages])

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
  const displayPackageId = lesson.session_package_id ?? sessionPackageId
  const selectedPackage = sessionPackages.find((pkg) => pkg.id === displayPackageId)

  async function handleSave() {
    if (!lesson) return
    setIsSaving(true)
    const result = await updateLessonRecord(lesson.id, {
      instructor_id: instructorId,
      lesson_type: lessonType,
      session_package_id: sessionPackageId || null,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('수업 기록 수정 실패', { description: result.error })
      return
    }

    if (result.data) {
      const nextLesson: MemberLessonRecord = {
        ...lesson,
        instructor_id: result.data.instructor_id,
        session_package_id: result.data.session_package_id,
        lesson_type: normalizeLessonType(result.data.lesson_type),
        instructor: result.data.instructor ?? null,
      }
      onUpdated?.(nextLesson)
      toast.success('수업 기록이 수정되었습니다.')
      setEditing(false)
    }
  }

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

        {canEdit && !editing ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              수정
            </Button>
          </div>
        ) : null}

        <div className="space-y-4 text-sm">
          {editing ? (
            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <InstructorSelectField
                id="record-instructor"
                label="강사"
                value={instructorId}
                onChange={setInstructorId}
                instructors={instructors}
              />
              <div className="space-y-1.5">
                <Label>수업 유형</Label>
                <Select value={lessonType} onValueChange={setLessonType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LESSON_TYPE_OPTIONS.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {sessionPackages.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="record-session-package">수업권</Label>
                  <Select
                    value={sessionPackageId || 'none'}
                    onValueChange={(value) =>
                      setSessionPackageId(value === 'none' ? '' : value)
                    }
                  >
                    <SelectTrigger id="record-session-package">
                      <SelectValue placeholder="수업권 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">미지정</SelectItem>
                      {sessionPackages.map((pkg) => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          {formatPackagePlanLabel(pkg.total_sessions, pkg.note)} · 잔여{' '}
                          {pkg.remaining_sessions}회
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">강사</p>
                <p className="font-medium">{lesson.instructor?.name || '미지정'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">유형</p>
                <p className="font-medium">{normalizeLessonType(lesson.lesson_type)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">수업권</p>
                <p className="font-medium">
                  {selectedPackage
                    ? formatPackagePlanLabel(
                        selectedPackage.total_sessions,
                        selectedPackage.note,
                      )
                    : lesson.session_package_id
                      ? '연결됨'
                      : '-'}
                </p>
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
          )}

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

        {editing ? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => setEditing(false)}
            >
              취소
            </Button>
            <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  저장 중…
                </>
              ) : (
                '저장'
              )}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
