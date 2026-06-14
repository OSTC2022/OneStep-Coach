'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  addSignatureToPastLesson,
  searchPastLessonsForSignature,
  type PastLessonSignatureRow,
} from '@/lib/actions/lesson-sessions'
import {
  formatShortLessonDate,
  formatTimeValue,
} from '@/lib/lesson-record-utils'
import { formatSessionOverageAlert } from '@/lib/session-package-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  History,
  Loader2,
  PenLine,
  Search,
} from 'lucide-react'

const SignaturePadDialog = dynamic(
  () =>
    import('@/components/ui/signature-pad-dialog').then((m) => ({
      default: m.SignaturePadDialog,
    })),
  { ssr: false },
)

interface PastLessonSignatureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 서명창에서 열 때 — 해당 회원 지난 수업만 */
  memberId?: string | null
  memberLabel?: string
  onLessonUpdated?: (
    lessonId: string,
    patch: {
      signature_id?: string | null
      end_time?: string | null
      session_deducted?: boolean
      attendance_status?: string
    },
  ) => void
}

function formatLessonTime(startTime: string | null, endTime: string | null) {
  const start = startTime?.slice(0, 5) ?? '시간 미정'
  if (endTime) return `${start} ~ ${endTime.slice(0, 5)}`
  return start
}

function formatLessonDateLabel(lessonDate: string) {
  return format(parseISO(lessonDate), 'M/d (EEE)', { locale: ko })
}

function formatStoredLessonEnd(endTime: string | null) {
  return formatTimeValue(endTime) ?? '-'
}

function SignatureStatusBadge({ hasSignature }: { hasSignature: boolean }) {
  return (
    <span
      className={cn(
        'text-[11px] font-bold tracking-tight',
        hasSignature ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      [사인]
    </span>
  )
}

export function PastLessonSignatureDialog({
  open,
  onOpenChange,
  memberId,
  memberLabel,
  onLessonUpdated,
}: PastLessonSignatureDialogProps) {
  const isMemberScoped = Boolean(memberId || memberLabel)
  const [lessons, setLessons] = useState<PastLessonSignatureRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLesson, setSelectedLesson] = useState<PastLessonSignatureRow | null>(
    null,
  )
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const loadLessons = useCallback(async () => {
    setIsLoading(true)
    const rows = await searchPastLessonsForSignature(
      memberId || memberLabel
        ? {
            memberId: memberId ?? undefined,
            memberLabel: memberId ? undefined : memberLabel,
            allLessons: true,
            limit: 200,
          }
        : undefined,
    )
    setLessons(rows)
    setIsLoading(false)
  }, [memberId, memberLabel])

  useEffect(() => {
    if (!open) {
      setSearchTerm('')
      setSelectedLesson(null)
      setSignatureOpen(false)
      return
    }

    void loadLessons()
  }, [open, loadLessons])

  const filteredLessons = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return lessons
    return lessons.filter(
      (lesson) =>
        lesson.memberLabel.toLowerCase().includes(query) ||
        lesson.instructorName?.toLowerCase().includes(query) ||
        lesson.lessonDate.includes(query),
    )
  }, [lessons, searchTerm])

  const sortedMemberLessons = useMemo(() => {
    if (!isMemberScoped) return filteredLessons
    return [...filteredLessons].sort((a, b) => {
      const dateCmp = a.lessonDate.localeCompare(b.lessonDate)
      if (dateCmp !== 0) return dateCmp
      return (a.startTime ?? '').localeCompare(b.startTime ?? '')
    })
  }, [filteredLessons, isMemberScoped])

  const groupedLessons = useMemo(() => {
    const groups = new Map<string, PastLessonSignatureRow[]>()
    for (const lesson of filteredLessons) {
      const group = groups.get(lesson.lessonDate) ?? []
      group.push(lesson)
      groups.set(lesson.lessonDate, group)
    }
    return [...groups.entries()]
  }, [filteredLessons])

  const missingSignatureCount = useMemo(
    () => lessons.filter((lesson) => !lesson.hasSignature).length,
    [lessons],
  )

  function handleSelectLesson(lesson: PastLessonSignatureRow) {
    setSelectedLesson(lesson)
  }

  function handleBackToList() {
    setSelectedLesson(null)
    setSignatureOpen(false)
  }

  async function handleSaveSignature(signatureData: string) {
    if (!selectedLesson) return

    setIsSaving(true)
    const result = await addSignatureToPastLesson(selectedLesson.id, signatureData)
    setIsSaving(false)

    if (result.error) {
      toast.error('서명 저장 실패', { description: result.error })
      return
    }

    const nextLesson: PastLessonSignatureRow = {
      ...selectedLesson,
      hasSignature: true,
      signatureData,
      signatureSignedAt: new Date().toISOString(),
      isCompleted: true,
      endTime: selectedLesson.endTime ?? result.data?.end_time ?? null,
    }

    setLessons((prev) =>
      prev.map((lesson) => (lesson.id === nextLesson.id ? nextLesson : lesson)),
    )
    setSelectedLesson(nextLesson)
    setSignatureOpen(false)

    if (result.data) {
      onLessonUpdated?.(selectedLesson.id, {
        signature_id: result.data.signature_id,
        end_time: selectedLesson.endTime ?? result.data.end_time,
        session_deducted: result.data.session_deducted,
        attendance_status: result.data.attendance_status,
      })
      if (result.data.session_overage && result.data.session_overage > 0) {
        toast.warning(
          formatSessionOverageAlert(result.data.session_overage, {
            noPackage: result.data.no_session_package,
          }),
          { duration: 8000 },
        )
      }
    }

    toast.success('서명이 저장되었습니다.')
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!isSaving) onOpenChange(nextOpen)
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              {selectedLesson ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleBackToList}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              ) : (
                <History className="h-5 w-5 shrink-0 text-primary" />
              )}
              {isMemberScoped && memberLabel && !selectedLesson
                ? `${memberLabel} 수업 기록`
                : '지난 수업 찾기'}
            </DialogTitle>
            <DialogDescription>
              {selectedLesson
                ? `${formatLessonDateLabel(selectedLesson.lessonDate)} ${formatLessonTime(selectedLesson.startTime, selectedLesson.endTime)}`
                : isMemberScoped
                  ? `전체 수업 · 서명 없음 ${missingSignatureCount}건`
                  : `최근 90일 · 서명 없음 ${missingSignatureCount}건`}
            </DialogDescription>
          </DialogHeader>

          {!selectedLesson ? (
            <>
              {!isMemberScoped ? (
                <div className="shrink-0 border-b border-border px-6 py-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="회원명·강사명 검색"
                      className="pl-8"
                    />
                  </div>
                </div>
              ) : memberLabel ? (
                <div className="shrink-0 border-b border-border px-6 py-3">
                  <p className="text-sm font-medium text-foreground">{memberLabel}</p>
                  <p className="text-xs text-muted-foreground">전체 수업 기록</p>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    수업 기록 불러오는 중…
                  </div>
                ) : filteredLessons.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    {searchTerm.trim()
                      ? '검색 결과가 없습니다.'
                      : '수업 기록이 없습니다.'}
                  </div>
                ) : isMemberScoped ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">회차</TableHead>
                        <TableHead>날짜</TableHead>
                        <TableHead>시작</TableHead>
                        <TableHead>종료</TableHead>
                        <TableHead>강사</TableHead>
                        <TableHead className="w-12 text-center">사인</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedMemberLessons.map((lesson) => {
                        return (
                          <TableRow
                            key={lesson.id}
                            className="cursor-pointer hover:bg-muted/30"
                            onClick={() => handleSelectLesson(lesson)}
                          >
                            <TableCell>
                              {lesson.lessonNo != null ? (
                                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                                  {lesson.lessonNo}회
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatShortLessonDate(lesson.lessonDate)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatTimeValue(lesson.startTime) || '-'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatStoredLessonEnd(lesson.endTime)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {lesson.instructorName ?? '미지정'}
                            </TableCell>
                            <TableCell className="text-center">
                              <SignatureStatusBadge hasSignature={lesson.hasSignature} />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="space-y-4">
                    {groupedLessons.map(([lessonDate, dayLessons]) => (
                      <div key={lessonDate}>
                        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                          {formatLessonDateLabel(lessonDate)}
                        </p>
                        <div className="space-y-1">
                          {dayLessons.map((lesson) => (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() => handleSelectLesson(lesson)}
                              className="flex w-full items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {formatLessonTime(lesson.startTime, lesson.endTime)}
                                  <span className="mx-1 text-muted-foreground">·</span>
                                  {lesson.memberLabel}
                                </p>
                                {lesson.instructorName ? (
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {lesson.instructorName} 강사
                                  </p>
                                ) : null}
                              </div>
                              <SignatureStatusBadge hasSignature={lesson.hasSignature} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                <p className="text-sm font-semibold">{selectedLesson.memberLabel}</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <span className="block text-[10px]">날짜</span>
                    <span className="text-foreground">
                      {formatLessonDateLabel(selectedLesson.lessonDate)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px]">시간</span>
                    <span className="text-foreground">
                      {formatLessonTime(
                        selectedLesson.startTime,
                        selectedLesson.endTime,
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px]">강사</span>
                    <span className="text-foreground">
                      {selectedLesson.instructorName ?? '-'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px]">회차</span>
                    <span className="text-foreground">
                      {selectedLesson.lessonNo != null
                        ? `${selectedLesson.lessonNo}회`
                        : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px]">사인</span>
                    <SignatureStatusBadge hasSignature={selectedLesson.hasSignature} />
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm',
                  selectedLesson.hasSignature
                    ? 'border-primary/30 bg-primary/10'
                    : 'border-border bg-muted/20',
                )}
              >
                {selectedLesson.hasSignature ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <p
                    className={cn(
                      'font-medium',
                      selectedLesson.hasSignature
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    <SignatureStatusBadge hasSignature={selectedLesson.hasSignature} />
                    {selectedLesson.hasSignature ? ' 저장됨' : ' 필요'}
                  </p>
                  {selectedLesson.signatureSignedAt ? (
                    <p className="text-xs opacity-80">
                      {format(
                        new Date(selectedLesson.signatureSignedAt),
                        'yyyy.M.d HH:mm',
                        { locale: ko },
                      )}
                    </p>
                  ) : null}
                </div>
              </div>

              {selectedLesson.hasSignature && selectedLesson.signatureData ? (
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-lg border border-border bg-muted/20 p-3">
                    <p className="mb-2 text-xs text-muted-foreground">보호자 서명</p>
                    <img
                      src={selectedLesson.signatureData}
                      alt="보호자 서명"
                      className="mx-auto max-h-40 w-full object-contain"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setSignatureOpen(true)}
                  >
                    <PenLine className="mr-2 h-4 w-4" />
                    서명 수정
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => setSignatureOpen(true)}
                >
                  <PenLine className="mr-2 h-4 w-4" />
                  서명 받기
                </Button>
              )}
            </div>
          )}

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {signatureOpen && selectedLesson ? (
        <SignaturePadDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !isSaving) setSignatureOpen(false)
          }}
          title={`${selectedLesson.memberLabel} 서명`}
          description="해당 회원의 보호자(부모님)께 직접 서명을 받아주세요."
          memberLabel={selectedLesson.memberLabel}
          confirmLabel="서명 저장"
          isSubmitting={isSaving}
          onConfirm={(signatureData) => void handleSaveSignature(signatureData)}
        />
      ) : null}
    </>
  )
}
