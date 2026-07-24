'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Link2, UserMinus, Clock, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  listMemberDuplicateReviews,
  linkSignupMemberToExistingMember,
  resolveMemberDuplicateReview,
  type MemberDuplicateReviewItem,
} from '@/lib/actions/member-duplicate-link'
import {
  ACCOUNT_LINK_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  MEMBER_SOURCE_LABELS,
} from '@/lib/member-account-status'

export function MemberDuplicateReviewSection({
  canManage = false,
}: {
  canManage?: boolean
}) {
  const [items, setItems] = useState<MemberDuplicateReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationHint, setMigrationHint] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirmLink, setConfirmLink] = useState<{
    signupId: string
    existingId: string
    signupName: string
    existingName: string
  } | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await listMemberDuplicateReviews()
    setItems(result.data)
    setMigrationHint(result.migrationRequired ? result.error ?? null : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        중복 후보 확인 중…
      </div>
    )
  }

  if (migrationHint) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        <p className="font-medium text-amber-900 dark:text-amber-100">중복 후보 기능 준비 필요</p>
        <p className="mt-1 text-muted-foreground">{migrationHint}</p>
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <h2 className="text-sm font-semibold">중복 후보 / 연동 필요 회원</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            이름만 같다고 자동 연결하지 않았습니다. 전화번호·생년월일 등으로 같은 사람일 가능성이 있는
            경우만 표시됩니다. 연결하면 기존 회원권과 출석 기록을 로그인 계정에서 사용할 수 있습니다.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.signupMember.id}
            className="rounded-md border border-border bg-background p-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/members/${item.signupMember.id}`}
                    className="font-semibold hover:underline"
                  >
                    {item.signupMember.name}
                  </Link>
                  <Badge variant="destructive" className="text-[10px]">
                    직접 가입 · 중복 후보
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {MEMBERSHIP_STATUS_LABELS[item.signupMember.membership_status]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.signupMember.phone ?? '연락처 없음'}
                  {item.signupMember.birth_date ? ` · 생년 ${item.signupMember.birth_date}` : ''}
                  {item.signupMember.duplicate_match_reason_label
                    ? ` · 기준: ${item.signupMember.duplicate_match_reason_label}`
                    : ''}
                </p>
              </div>
            </div>

            {item.existingMember ? (
              <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <p className="font-medium">
                  기존 후보:{' '}
                  <Link
                    href={`/dashboard/members/${item.existingMember.id}`}
                    className="underline"
                  >
                    {item.existingMember.name}
                  </Link>
                </p>
                <p className="mt-1 text-muted-foreground">
                  {MEMBER_SOURCE_LABELS[item.existingMember.source_type]} ·{' '}
                  {MEMBERSHIP_STATUS_LABELS[item.existingMember.membership_status]}
                  {item.existingMember.remaining_sessions > 0
                    ? ` (잔여 ${item.existingMember.remaining_sessions}회)`
                    : ''}{' '}
                  · {ACCOUNT_LINK_LABELS[item.existingMember.account_link_status]}
                  {item.existingMember.last_lesson_date
                    ? ` · 최근 수업 ${item.existingMember.last_lesson_date}`
                    : ''}
                </p>
                <p className="mt-1 text-muted-foreground">
                  회원권이 있는 기존 회원과 연결할 수 있습니다.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                연결된 기존 후보 정보가 없습니다. 회원 상세에서 다시 검색할 수 있습니다.
              </p>
            )}

            {canManage ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.existingMember ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      setConfirmLink({
                        signupId: item.signupMember.id,
                        existingId: item.existingMember!.id,
                        signupName: item.signupMember.name,
                        existingName: item.existingMember!.name,
                      })
                    }
                  >
                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                    기존 회원과 연결하기
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await resolveMemberDuplicateReview({
                        signupMemberId: item.signupMember.id,
                        resolution: 'keep_separate',
                      })
                      if (result.error) {
                        toast.error(result.error)
                        return
                      }
                      toast.success('별도 회원으로 유지했습니다.')
                      void reload()
                    })
                  }}
                >
                  <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                  별도 회원으로 유지
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await resolveMemberDuplicateReview({
                        signupMemberId: item.signupMember.id,
                        resolution: 'later',
                      })
                      toast.message('나중에 다시 확인할 수 있습니다.')
                    })
                  }}
                >
                  <Clock className="mr-1.5 h-3.5 w-3.5" />
                  나중에 확인
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await resolveMemberDuplicateReview({
                        signupMemberId: item.signupMember.id,
                        resolution: 'false_positive',
                      })
                      if (result.error) {
                        toast.error(result.error)
                        return
                      }
                      toast.success('잘못된 후보로 표시했습니다.')
                      void reload()
                    })
                  }}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" />
                  잘못된 후보
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <AlertDialog
        open={Boolean(confirmLink)}
        onOpenChange={(open) => {
          if (!open) setConfirmLink(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기존 회원과 연결할까요?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                <strong>{confirmLink?.signupName}</strong> 로그인 계정을{' '}
                <strong>{confirmLink?.existingName}</strong> 회원 데이터에 연결합니다.
              </span>
              <span className="block">
                기존 회원권·출석·결제 기록은 유지되고, 신규가입으로 생긴 빈 회원 행은 통합(숨김)
                처리됩니다. 데이터는 삭제하지 않습니다.
              </span>
              <span className="block text-amber-700 dark:text-amber-300">
                이름만 같은 다른 사람이면 연결하지 마세요.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmLink) return
                startTransition(async () => {
                  const result = await linkSignupMemberToExistingMember({
                    signupMemberId: confirmLink.signupId,
                    existingMemberId: confirmLink.existingId,
                  })
                  if (result.error) {
                    toast.error('연결 실패', { description: result.error })
                    return
                  }
                  toast.success('기존 회원과 연결되었습니다.')
                  setConfirmLink(null)
                  void reload()
                  if (result.keepMemberId) {
                    window.location.href = `/dashboard/members/${result.keepMemberId}`
                  }
                })
              }}
            >
              연결하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
