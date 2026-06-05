'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteSessionPackage } from '@/lib/actions/sessions'
import { Member, SessionPackage } from '@/types/database'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  Edit,
  User,
  Phone,
  Calendar,
  Target,
  AlertTriangle,
  FileText,
  CreditCard,
  Trash2,
} from 'lucide-react'
import { formatMemberAge, formatBirthDateDisplay, formatPrimaryInstructorName } from '@/lib/member-utils'
import { MemberAccountLink } from '@/components/members/member-account-link'
import { SessionPackageTrashSheet } from './session-package-trash-sheet'
import {
  LessonRecordDetailDialog,
  type MemberLessonRecord,
} from './lesson-record-detail-dialog'
import {
  getAttendanceDisplay,
  getLessonScheduleParts,
  sortLessonsForRecentDisplay,
  linkPackageTallyToSessions,
} from '@/lib/lesson-record-utils'

const LESSON_RECORD_PAGE_SIZE = 10

interface MemberDetailProps {
  member: Member & { primary_instructor?: { id: string; name: string } | null }
  sessionPackages: SessionPackage[]
  lessons: MemberLessonRecord[]
  sessionNumberByLessonId?: Record<string, number>
  initialTrashCount?: number
  accountEmail?: string | null
  accountEmailSource?: 'auth' | 'invite' | null
}

function formatPackageDate(value: string | null | undefined) {
  if (!value) return '-'
  return value.split('T')[0]
}

export function MemberDetail({
  member,
  sessionPackages: initialPackages,
  lessons,
  sessionNumberByLessonId = {},
  initialTrashCount = 0,
  accountEmail = null,
  accountEmailSource = null,
}: MemberDetailProps) {
  const router = useRouter()
  const [sessionPackages, setSessionPackages] = useState(initialPackages)
  const [deleteTarget, setDeleteTarget] = useState<SessionPackage | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [trashCount, setTrashCount] = useState(initialTrashCount)
  const [recentTrashItems, setRecentTrashItems] = useState<SessionPackage[]>([])
  const [detailLesson, setDetailLesson] = useState<MemberLessonRecord | null>(null)
  const [lessonPage, setLessonPage] = useState(1)

  const sortedLessons = useMemo(
    () => sortLessonsForRecentDisplay(lessons, sessionNumberByLessonId),
    [lessons, sessionNumberByLessonId],
  )

  const lessonTotalPages = Math.max(
    1,
    Math.ceil(sortedLessons.length / LESSON_RECORD_PAGE_SIZE),
  )

  const pagedLessons = useMemo(() => {
    const start = (lessonPage - 1) * LESSON_RECORD_PAGE_SIZE
    return sortedLessons.slice(start, start + LESSON_RECORD_PAGE_SIZE)
  }, [sortedLessons, lessonPage])

  useEffect(() => {
    setLessonPage(1)
  }, [lessons])

  useEffect(() => {
    if (lessonPage > lessonTotalPages) {
      setLessonPage(lessonTotalPages)
    }
  }, [lessonPage, lessonTotalPages])

  useEffect(() => {
    setSessionPackages(initialPackages)
  }, [initialPackages])

  useEffect(() => {
    setTrashCount(initialTrashCount)
  }, [initialTrashCount])

  const packageTally = useMemo(
    () => linkPackageTallyToSessions(sessionPackages, sessionNumberByLessonId),
    [sessionPackages, sessionNumberByLessonId],
  )
  const activePackage = sessionPackages.find((p) => p.is_active && p.remaining_sessions > 0)
  const totalRemainingSessions = packageTally.remaining

  async function handleDeletePackage() {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteSessionPackage(deleteTarget.id)
    setDeleting(false)

    if (result.error) {
      toast.error('삭제 실패', { description: result.error })
      return
    }

    const trashedPackage: SessionPackage = {
      ...deleteTarget,
      deleted_at: new Date().toISOString(),
    }
    setSessionPackages((prev) => prev.filter((p) => p.id !== deleteTarget.id))
    setRecentTrashItems((prev) => [
      trashedPackage,
      ...prev.filter((p) => p.id !== trashedPackage.id),
    ])
    setTrashCount((c) => c + 1)
    setDeleteTarget(null)
    toast.success('수업권이 휴지통으로 이동했습니다.')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/members">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold">{member.name}</h1>
              <Badge variant={member.is_active ? 'default' : 'secondary'}>
                {member.is_active ? '활성' : '비활성'}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              등록일: {new Date(member.registered_at).toLocaleDateString('ko-KR')}
            </p>
          </div>
        </div>
        <Link href={`/dashboard/members/${member.id}/edit`}>
          <Button>
            <Edit className="h-4 w-4 mr-2" />
            수정
          </Button>
        </Link>
      </div>

      {/* Info Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              기본 정보
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">생년월일</span>
              <span>{formatBirthDateDisplay(member.birth_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">나이</span>
              <span>{formatMemberAge(member)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">학년 / 포지션</span>
              <span>{member.grade || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">종목</span>
              <span>{member.sport || '-'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Phone className="h-5 w-5 text-primary" />
              연락처
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">본인</span>
              <span>{member.phone || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">보호자</span>
              <span>{member.parent_phone || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">담당 강사</span>
              <span>{formatPrimaryInstructorName(member.primary_instructor)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Physical Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              신체 정보
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">키</span>
              <span>{member.height_cm ? `${member.height_cm}cm` : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">몸무게</span>
              <span>{member.weight_kg ? `${member.weight_kg}kg` : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">BMI</span>
              <span className={member.bmi ? (
                member.bmi < 18.5 ? 'text-blue-400' :
                member.bmi < 23 ? 'text-green-400' :
                member.bmi < 25 ? 'text-yellow-400' : 'text-red-400'
              ) : ''}>
                {member.bmi ? member.bmi.toFixed(1) : '-'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Session Info */}
        <Card className={totalRemainingSessions <= 3 && totalRemainingSessions > 0 ? 'border-warning' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" />
              수업권 현황
              {totalRemainingSessions <= 3 && totalRemainingSessions > 0 && (
                <AlertTriangle className="h-4 w-4 text-warning" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 py-2 text-center">
              <div>
                <p className="text-2xl font-bold tabular-nums">{packageTally.total}</p>
                <p className="text-xs text-muted-foreground mt-1">회차</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-primary">
                  {packageTally.remaining}
                </p>
                <p className="text-xs text-muted-foreground mt-1">잔여</p>
              </div>
            </div>
            {activePackage && (
              <div className="text-sm text-muted-foreground space-y-1 border-t border-border pt-3 mt-3">
                {activePackage.expires_at && (
                  <p>만료일: {formatPackageDate(activePackage.expires_at)}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Goals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              운동 목표
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{member.goal || '설정된 목표가 없습니다.'}</p>
          </CardContent>
        </Card>

        {/* Injury History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-warning" />
              부상 이력
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{member.injury_history || '기록된 부상 이력이 없습니다.'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Memo */}
      {member.memo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              메모
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{member.memo}</p>
          </CardContent>
        </Card>
      )}

      {/* Session Packages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            수업권 내역
          </CardTitle>
          <div className="flex items-center gap-2">
            <SessionPackageTrashSheet
              memberId={member.id}
              initialCount={trashCount}
              recentTrashItems={recentTrashItems}
              onTrashCountChange={setTrashCount}
              onRestore={(pkg) => {
                setSessionPackages((prev) => {
                  const ids = new Set(prev.map((p) => p.id))
                  if (ids.has(pkg.id)) return prev
                  return [pkg, ...prev]
                })
                setRecentTrashItems((prev) => prev.filter((p) => p.id !== pkg.id))
              }}
            />
            <Link href={`/dashboard/members/${member.id}/packages/new`}>
              <Button size="sm">수업권 추가</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {sessionPackages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">등록된 수업권이 없습니다.</p>
          ) : (
            <>
            <div className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm tabular-nums">
              <span>
                회차{' '}
                <strong className="text-base font-bold">{packageTally.total}</strong>회
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                잔여{' '}
                <strong className="text-base font-bold text-primary">
                  {packageTally.remaining}
                </strong>
                회
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>회차</TableHead>
                  <TableHead>잔여</TableHead>
                  <TableHead>금액</TableHead>
                  <TableHead>결제일</TableHead>
                  <TableHead>만료일</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap text-center">상태</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionPackages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell>{pkg.total_sessions}회</TableCell>
                    <TableCell className={pkg.remaining_sessions <= 3 ? 'text-warning font-medium' : ''}>
                      {pkg.remaining_sessions}회
                    </TableCell>
                    <TableCell>{pkg.price ? `${pkg.price.toLocaleString()}원` : '-'}</TableCell>
                    <TableCell>{formatPackageDate(pkg.paid_at)}</TableCell>
                    <TableCell>{formatPackageDate(pkg.expires_at)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                        {pkg.is_active ? '사용중' : '종료'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/dashboard/members/${member.id}/packages/${pkg.id}/edit`}>
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <Edit className="h-3.5 w-3.5 mr-1" />
                            수정
                          </Button>
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(pkg)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          삭제
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Lessons */}
      <Card>
        <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            최근 수업 기록
          </CardTitle>
          {packageTally.total > 0 && (
            <p className="text-sm text-muted-foreground tabular-nums">
              회차 {packageTally.total}회 · 잔여 {packageTally.remaining}회
            </p>
          )}
        </CardHeader>
        <CardContent>
          {sortedLessons.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">수업 기록이 없습니다.</p>
          ) : (
            <>
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
                  const schedule = getLessonScheduleParts({
                    lessonDate: lesson.lesson_date,
                    start_time: lesson.start_time,
                    end_time: lesson.end_time,
                    signature_signed_at: lesson.signature?.signed_at,
                    lesson_session_checked_in_at: lesson.lesson_sessions?.[0]?.checked_in_at,
                  })

                  return (
                    <TableRow key={lesson.id}>
                      <TableCell>
                        {lesson.session_deducted && sessionNumber != null ? (
                          <button
                            type="button"
                            onClick={() => setDetailLesson(lesson)}
                            className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/25"
                            title={`수업권 ${sessionNumber}/${packageTally.total}회`}
                          >
                            {sessionNumber}회
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{schedule.date}</TableCell>
                      <TableCell className="whitespace-nowrap">{schedule.start || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{schedule.end || '-'}</TableCell>
                      <TableCell>{lesson.instructor?.name || '미지정'}</TableCell>
                      <TableCell>{lesson.lesson_type}</TableCell>
                      <TableCell>
                        {(() => {
                          const attendance = getAttendanceDisplay(lesson)
                          if (!attendance) {
                            return <span className="text-xs text-muted-foreground">-</span>
                          }
                          return (
                            <Badge variant={attendance.variant}>
                              {attendance.label}
                            </Badge>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{lesson.content || '-'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {lessonTotalPages > 1 && (
              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  총 {sortedLessons.length}건 ·{' '}
                  {(lessonPage - 1) * LESSON_RECORD_PAGE_SIZE + 1}–
                  {Math.min(lessonPage * LESSON_RECORD_PAGE_SIZE, sortedLessons.length)}건
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={lessonPage <= 1}
                    onClick={() => setLessonPage((page) => Math.max(1, page - 1))}
                  >
                    이전
                  </Button>
                  <span className="min-w-[4.5rem] text-center text-sm tabular-nums">
                    {lessonPage} / {lessonTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={lessonPage >= lessonTotalPages}
                    onClick={() =>
                      setLessonPage((page) => Math.min(lessonTotalPages, page + 1))
                    }
                  >
                    다음
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      <LessonRecordDetailDialog
        lesson={detailLesson}
        sessionNumber={
          detailLesson ? sessionNumberByLessonId[detailLesson.id] ?? null : null
        }
        open={detailLesson != null}
        onOpenChange={(open) => {
          if (!open) setDetailLesson(null)
        }}
      />

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수업권 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.total_sessions}회 · ${deleteTarget.price ? `${Number(deleteTarget.price).toLocaleString()}원` : '금액 미입력'} 수업권을 삭제하시겠습니까? 휴지통으로 이동하며, 휴지통에서 복구할 수 있습니다.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDeletePackage()
              }}
            >
              {deleting ? '삭제 중…' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberAccountLink
        memberId={member.id}
        memberName={member.name}
        linkedAuthUserId={
          ('auth_user_id' in member ? member.auth_user_id : null) ?? member.user_id
        }
        registeredEmail={accountEmail}
        emailSource={accountEmailSource}
      />
    </div>
  )
}
