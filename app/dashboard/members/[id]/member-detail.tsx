'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { deleteSessionPackage } from '@/lib/actions/sessions'
import { MemberPhysicalInfoEditor } from '@/components/members/member-physical-info-editor'
import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
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
  Trophy,
  Calendar,
  Target,
  AlertTriangle,
  FileText,
  CreditCard,
  Trash2,
} from 'lucide-react'
import { formatPrimaryInstructorName } from '@/lib/member-utils'
import { mergeMemberWithDetailPatch } from '@/lib/member-detail-sync'
import { MemberBasicInfoEditor } from '@/components/members/member-basic-info-editor'
import { MemberContactEditor } from '@/components/members/member-contact-editor'
import type { VisibleSnsAccount } from '@/lib/sns-account'
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
import {
  formatPackagePlanLabel,
  formatPackageRemainingDisplay,
  formatPackageSessionsDisplay,
  formatPackageTallyRemainingDisplay,
  formatPackageTallyTotalDisplay,
  formatSessionOverageAlert,
  getPackageRemainingColorClass,
  isPackageUsableForLesson,
  isSessionPackageOverage,
  UNLIMITED_SESSIONS_DISPLAY,
} from '@/lib/session-package-utils'
import { GroupedPackageUsageDisplay } from '@/components/sessions/grouped-package-usage-display'
import {
  groupSessionPackagesForDisplay,
} from '@/lib/session-package-grouping'
import { cn } from '@/lib/utils'
import { MemberStaffLeagueSummary } from '@/components/dashboard/member-staff-league-summary'
import type { MemberRunningLeagueHome } from '@/lib/actions/running-league'

const LESSON_RECORD_PAGE_SIZE = 10

interface MemberDetailProps {
  member: Member & { primary_instructor?: { id: string; name: string } | null }
  sessionPackages: SessionPackage[]
  lessons: MemberLessonRecord[]
  sessionNumberByLessonId?: Record<string, number>
  initialTrashCount?: number
  accountEmail?: string | null
  accountEmailSource?: 'auth' | 'invite' | null
  bodyRecords?: MemberBodyRecord[]
  bodyTableReady?: boolean
  canManage?: boolean
  canEditBasicInfo?: boolean
  canShowPhysicalEditButton?: boolean
  canSavePhysicalInitial?: boolean
  canAddBodyRecord?: boolean
  instructorAccount?: VisibleSnsAccount | null
  centerAccount?: VisibleSnsAccount | null
  linkedProfileRole?: string | null
  runningLeagueHome?: MemberRunningLeagueHome | null
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
  bodyRecords = [],
  bodyTableReady = true,
  canManage = true,
  canEditBasicInfo = false,
  canShowPhysicalEditButton = false,
  canSavePhysicalInitial = false,
  canAddBodyRecord = false,
  instructorAccount = null,
  centerAccount = null,
  linkedProfileRole = null,
  runningLeagueHome = null,
}: MemberDetailProps) {
  const [memberState, setMemberState] = useState(() =>
    mergeMemberWithDetailPatch(member, member.id),
  )
  const [sessionPackages, setSessionPackages] = useState(initialPackages)
  const [deleteTarget, setDeleteTarget] = useState<SessionPackage | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [trashCount, setTrashCount] = useState(initialTrashCount)
  const [recentTrashItems, setRecentTrashItems] = useState<SessionPackage[]>([])
  const removedPackageIdsRef = useRef(new Set<string>())
  const [detailLesson, setDetailLesson] = useState<MemberLessonRecord | null>(null)
  const [lessonPage, setLessonPage] = useState(1)

  const sortedLessons = useMemo(
    () => sortLessonsForRecentDisplay(lessons, sessionNumberByLessonId),
    [lessons, sessionNumberByLessonId],
  )

  useEffect(() => {
    setMemberState(mergeMemberWithDetailPatch(member, member.id))
  }, [
    member,
    member.id,
    member.birth_date,
    member.age,
    member.grade,
    member.school,
    member.name,
    member.phone,
    member.parent_phone,
    member.sport,
    member.height_cm,
    member.weight_kg,
    member.primary_instructor_id,
  ])

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
    setSessionPackages(
      initialPackages.filter((pkg) => !removedPackageIdsRef.current.has(pkg.id)),
    )
  }, [initialPackages])

  useEffect(() => {
    setTrashCount(initialTrashCount)
  }, [initialTrashCount])

  const groupedSessionPackages = useMemo(
    () => groupSessionPackagesForDisplay(sessionPackages),
    [sessionPackages],
  )
  const sortedSessionPackages = useMemo(
    () => [...sessionPackages].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [sessionPackages],
  )

  const packageTally = useMemo(
    () => linkPackageTallyToSessions(sessionPackages, sessionNumberByLessonId),
    [sessionPackages, sessionNumberByLessonId],
  )
  const tallyTotalDisplay = useMemo(
    () => formatPackageTallyTotalDisplay(sessionPackages),
    [sessionPackages],
  )
  const tallyRemainingDisplay = useMemo(
    () => formatPackageTallyRemainingDisplay(sessionPackages),
    [sessionPackages],
  )
  const isTallyUnlimited =
    tallyTotalDisplay === UNLIMITED_SESSIONS_DISPLAY ||
    tallyRemainingDisplay === UNLIMITED_SESSIONS_DISPLAY
  const activePackageGroup = groupedSessionPackages.find((group) =>
    isPackageUsableForLesson(group.primary),
  )
  const activePackage = activePackageGroup?.primary
  const totalRemainingSessions = packageTally.remaining
  const hasSessionOverage = totalRemainingSessions < 0
  const isLowRemaining =
    totalRemainingSessions <= 3 && totalRemainingSessions > 0

  async function handleDeletePackage() {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteSessionPackage(deleteTarget.id)
    setDeleting(false)

    if (result.error) {
      toast.error('삭제 실패', { description: result.error })
      return
    }

    removedPackageIdsRef.current.add(deleteTarget.id)

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
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-bold">{memberState.name}</h1>
              <Badge variant={memberState.is_active ? 'default' : 'secondary'}>
                {memberState.is_active ? '활성' : '비활성'}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              등록일:{' '}
              {new Date(memberState.registered_at).toLocaleDateString('ko-KR')}
            </p>
            {linkedProfileRole === 'adult_member' ? (
              <p className="text-sm text-muted-foreground">
                {memberState.sport ? `${memberState.sport}` : '성인 러닝'}
                {' · '}
                담당 코치 {formatPrimaryInstructorName(memberState.primary_instructor)}
              </p>
            ) : null}
          </div>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {linkedProfileRole === 'adult_member' ? (
              <Link href={`/dashboard/members/${memberState.id}/running-portal`}>
                <Button variant="outline">
                  <Trophy className="mr-2 h-4 w-4" />
                  러닝 포털 보기
                </Button>
              </Link>
            ) : null}
            <Link href={`/dashboard/members/${memberState.id}/edit`}>
              <Button>
                <Edit className="h-4 w-4 mr-2" />
                수정
              </Button>
            </Link>
          </div>
        ) : null}
      </div>

      {linkedProfileRole === 'adult_member' ? (
        <MemberStaffLeagueSummary
          memberId={memberState.id}
          runningLeagueHome={runningLeagueHome}
          canManage={canManage}
          runningPortalHref={`/dashboard/members/${memberState.id}/running-portal`}
        />
      ) : null}

      {/* Info Cards Grid */}
      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        {/* Basic Info */}
        <MemberBasicInfoEditor
          memberId={memberState.id}
          birthDate={memberState.birth_date}
          age={memberState.age}
          grade={memberState.grade}
          school={memberState.school ?? null}
          canEdit={canEditBasicInfo}
          onSaved={(data) => setMemberState((prev) => ({ ...prev, ...data }))}
        />

        {/* Contact Info */}
        <MemberContactEditor
          memberId={memberState.id}
          phone={memberState.phone}
          parentPhone={memberState.parent_phone}
          kakaoId={memberState.kakao_id ?? null}
          instagramId={memberState.instagram_id ?? null}
          instructorName={formatPrimaryInstructorName(memberState.primary_instructor)}
          instructorAccount={instructorAccount}
          centerAccount={centerAccount}
          canEdit={canEditBasicInfo}
          onSaved={(data) => setMemberState((prev) => ({ ...prev, ...data }))}
        />

        <MemberPhysicalInfoEditor
          memberId={memberState.id}
          memberName={memberState.name}
          heightCm={memberState.height_cm}
          weightKg={memberState.weight_kg}
          canEditInitial={canShowPhysicalEditButton}
          canSaveInitial={canSavePhysicalInitial}
          bodyRecords={bodyRecords}
          canAddRecord={canAddBodyRecord}
          onSaved={(data) => setMemberState((prev) => ({ ...prev, ...data }))}
        />

        {/* Session Info */}
        <Card
          className={
            hasSessionOverage
              ? 'border-destructive'
              : isLowRemaining
                ? 'border-warning'
                : ''
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" />
              수업권 현황
              {hasSessionOverage ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : isLowRemaining ? (
                <AlertTriangle className="h-4 w-4 text-warning" />
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 py-2 text-center">
              <div>
                <p className="text-2xl font-bold tabular-nums">{tallyTotalDisplay}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isTallyUnlimited ? '회차 (무제한)' : '회차'}
                </p>
              </div>
              <div>
                <p
                  className={`text-2xl font-bold tabular-nums ${getPackageRemainingColorClass(totalRemainingSessions)}`}
                >
                  {tallyRemainingDisplay}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isTallyUnlimited ? '잔여 (무제한)' : '잔여'}
                </p>
              </div>
            </div>
            {hasSessionOverage ? (
              <p className="mt-2 text-center text-sm font-medium text-destructive">
                {formatSessionOverageAlert(Math.abs(totalRemainingSessions))}
              </p>
            ) : null}
            {activePackage && activePackageGroup && (
              <div className="text-sm text-muted-foreground space-y-1 border-t border-border pt-3 mt-3">
                <p>
                  {formatPackagePlanLabel(activePackage.total_sessions, activePackage.note, {
                    duplicateCount: activePackageGroup.duplicateCount,
                    cumulativeTotalSessions: activePackageGroup.cumulativeTotalSessions,
                  })}{' '}
                  ·{' '}
                  <span>
                    <GroupedPackageUsageDisplay
                      remainingSessions={activePackageGroup.cumulativeRemainingSessions}
                      latestPurchaseTotalSessions={
                        activePackageGroup.latestPurchaseTotalSessions
                      }
                      cumulativeTotalSessions={
                        activePackageGroup.cumulativeTotalSessions
                      }
                      note={activePackage.note}
                      isActive={activePackage.is_active}
                      expiresAt={activePackage.expires_at}
                      paidAt={activePackage.paid_at}
                    />
                  </span>
                </p>
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
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            수업권 내역
          </CardTitle>
          {canManage ? (
            <Link href={`/dashboard/members/${member.id}/packages/new`}>
              <Button size="sm">수업권 추가</Button>
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="min-w-0 overflow-hidden">
          {sessionPackages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">등록된 수업권이 없습니다.</p>
          ) : (
            <>
            <div className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm tabular-nums">
              <span>
                회차{' '}
                <strong className="text-base font-bold">{tallyTotalDisplay}</strong>
                {isTallyUnlimited ? '' : '회'}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                잔여{' '}
                <strong className="text-base font-bold text-primary">
                  {tallyRemainingDisplay}
                </strong>
                {isTallyUnlimited ? '' : '회'}
              </span>
            </div>
            <div className="w-full min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-0.5 py-2 text-xs font-medium text-muted-foreground">
                <span className="flex min-w-[7rem] shrink-0 items-center gap-0.5 whitespace-nowrap">
                  <span>수업권</span>
                  {canManage ? (
                    <SessionPackageTrashSheet
                      memberId={member.id}
                      initialCount={trashCount}
                      recentTrashItems={recentTrashItems}
                      compact
                      onTrashCountChange={setTrashCount}
                      onRestore={(pkg) => {
                        removedPackageIdsRef.current.delete(pkg.id)
                        setSessionPackages((prev) => {
                          const ids = new Set(prev.map((p) => p.id))
                          if (ids.has(pkg.id)) return prev
                          return [pkg, ...prev]
                        })
                        setRecentTrashItems((prev) => prev.filter((p) => p.id !== pkg.id))
                      }}
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">잔여</span>
                <span className="hidden w-[4.5rem] shrink-0 sm:block">금액</span>
                <span className="hidden w-[4.75rem] shrink-0 md:block">결제일</span>
                <span className="w-[3.25rem] shrink-0 text-center">상태</span>
                {canManage ? <span className="w-[4.25rem] shrink-0" aria-hidden /> : null}
              </div>
              <ul className="divide-y divide-border">
                {sortedSessionPackages.map((pkg) => (
                  <li
                    key={pkg.id}
                    className="flex min-w-0 items-center gap-2 px-0.5 py-2.5 text-sm"
                  >
                    <span className="min-w-[7rem] shrink-0 whitespace-nowrap font-medium">
                      {formatPackagePlanLabel(pkg.total_sessions, pkg.note)}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate tabular-nums font-semibold',
                        getPackageRemainingColorClass(
                          pkg.remaining_sessions,
                          pkg.note,
                          pkg.is_active,
                        ),
                      )}
                    >
                      {formatPackageRemainingDisplay(
                        pkg.remaining_sessions,
                        pkg.note,
                        pkg.expires_at,
                        pkg.paid_at,
                      )}{' '}
                      {formatPackageSessionsDisplay(pkg.total_sessions, pkg.note)}
                      {isSessionPackageOverage(pkg.remaining_sessions, pkg.note) ? (
                        <span className="ml-1 text-[10px] text-destructive">초과</span>
                      ) : null}
                    </span>
                    <span className="hidden w-[4.5rem] shrink-0 truncate text-xs text-muted-foreground sm:block">
                      {pkg.price ? `${pkg.price.toLocaleString()}원` : '-'}
                    </span>
                    <span className="hidden w-[4.75rem] shrink-0 text-xs text-muted-foreground md:block">
                      {formatPackageDate(pkg.paid_at)}
                    </span>
                    <span className="flex w-[3.25rem] shrink-0 justify-center">
                      <Badge
                        variant={pkg.is_active ? 'default' : 'secondary'}
                        className="px-1.5 text-[10px]"
                      >
                        {pkg.is_active ? '사용중' : '종료'}
                      </Badge>
                    </span>
                    {canManage ? (
                      <div className="flex w-[4.25rem] shrink-0 justify-end gap-0">
                        <Link href={`/dashboard/members/${member.id}/packages/${pkg.id}/edit`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="수업권 수정"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="수업권 삭제"
                          onClick={() => setDeleteTarget(pkg)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
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
                  const isSessionOver =
                    lesson.session_deducted &&
                    sessionNumber != null &&
                    packageTally.total > 0 &&
                    sessionNumber > packageTally.total
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
                            className={`rounded px-1.5 py-0.5 text-xs font-semibold hover:opacity-90 ${
                              isSessionOver
                                ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                                : 'bg-primary/15 text-primary hover:bg-primary/25'
                            }`}
                            title={
                              isSessionOver
                                ? `수업권 ${sessionNumber - packageTally.total}회 초과 (${sessionNumber}/${packageTally.total}회)`
                                : `수업권 ${sessionNumber}/${packageTally.total}회`
                            }
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

      {canManage ? (
        <MemberAccountLink
          memberId={member.id}
          memberName={member.name}
          linkedAuthUserId={
            ('auth_user_id' in member ? member.auth_user_id : null) ?? member.user_id
          }
          registeredEmail={accountEmail}
          emailSource={accountEmailSource}
        />
      ) : null}
    </div>
  )
}
