'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, Link2, UserMinus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  getMemberDuplicateContext,
  linkSignupMemberToExistingMember,
  resolveMemberDuplicateReview,
  type MemberDuplicateReviewItem,
} from '@/lib/actions/member-duplicate-link'
import {
  ACCOUNT_LINK_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  MEMBER_SOURCE_HINTS,
  MEMBER_SOURCE_LABELS,
  resolveAccountLinkStatus,
  resolveSourceType,
  type MemberAccountLinkStatus,
  type MemberMembershipStatus,
  type MemberSourceType,
} from '@/lib/member-account-status'
import { MemberStatusBadges } from '@/components/members/member-status-badges'

export function MemberAccountStatusPanel({
  member,
  accountEmail,
  canManage = false,
}: {
  member: {
    id: string
    source_type?: MemberSourceType | null
    account_link_status?: MemberAccountLinkStatus | null
    membership_status?: MemberMembershipStatus | null
    remaining_sessions?: number | null
    auth_user_id?: string | null
    user_id?: string | null
    memo?: string | null
    linked_at?: string | null
    duplicate_match_reason?: string | null
  }
  accountEmail?: string | null
  canManage?: boolean
}) {
  const [context, setContext] = useState<{
    isCandidate: boolean
    matchReasonLabel: string | null
    existingMember: MemberDuplicateReviewItem['existingMember']
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const source = resolveSourceType(member)
  const link = resolveAccountLinkStatus(member)

  useEffect(() => {
    void getMemberDuplicateContext(member.id).then((result) => {
      setContext({
        isCandidate: result.isCandidate,
        matchReasonLabel: result.matchReasonLabel,
        existingMember: result.existingMember,
      })
    })
  }, [member.id])

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">가입 · 계정 · 회원권</h3>
        <p className="mt-1 text-xs text-muted-foreground">{MEMBER_SOURCE_HINTS[source]}</p>
        <div className="mt-2">
          <MemberStatusBadges member={member} />
        </div>
        <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="inline text-foreground">가입 경로: </dt>
            <dd className="inline">{MEMBER_SOURCE_LABELS[source]}</dd>
          </div>
          <div>
            <dt className="inline text-foreground">계정 연동: </dt>
            <dd className="inline">{ACCOUNT_LINK_LABELS[link]}</dd>
          </div>
          <div>
            <dt className="inline text-foreground">로그인: </dt>
            <dd className="inline">{accountEmail || (member.auth_user_id || member.user_id ? '연결됨' : '없음')}</dd>
          </div>
          <div>
            <dt className="inline text-foreground">연결 일자: </dt>
            <dd className="inline">
              {member.linked_at ? member.linked_at.slice(0, 10) : link === 'linked' ? '-' : '미연동'}
            </dd>
          </div>
        </dl>
      </div>

      {context?.isCandidate ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">
                이 회원은 기존 회원과 같은 사람일 가능성이 있습니다.
              </p>
              <p className="text-muted-foreground">
                기존 회원권을 가진 회원과 연결하면 출석, 결제, 회원권 정보를 그대로 사용할 수
                있습니다. {context.matchReasonLabel ? `(기준: ${context.matchReasonLabel})` : ''}
              </p>
              {context.existingMember ? (
                <p>
                  후보:{' '}
                  <Link
                    href={`/dashboard/members/${context.existingMember.id}`}
                    className="font-medium underline"
                  >
                    {context.existingMember.name}
                  </Link>{' '}
                  · {MEMBERSHIP_STATUS_LABELS[context.existingMember.membership_status]}
                  {context.existingMember.remaining_sessions > 0
                    ? ` (잔여 ${context.existingMember.remaining_sessions}회)`
                    : ''}
                </p>
              ) : null}
              {canManage ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {context.existingMember ? (
                    <Button size="sm" disabled={pending} onClick={() => setConfirmOpen(true)}>
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
                          signupMemberId: member.id,
                          resolution: 'keep_separate',
                        })
                        if (result.error) {
                          toast.error(result.error)
                          return
                        }
                        toast.success('별도 회원으로 유지했습니다.')
                        window.location.reload()
                      })
                    }}
                  >
                    <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                    별도 회원으로 유지하기
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기존 회원과 연결할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              연결하면 기존 회원권과 출석 기록을 이 로그인 계정에서 사용할 수 있습니다. 별도
              회원으로 유지하면 두 회원은 각각 관리됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!context?.existingMember) return
                startTransition(async () => {
                  const result = await linkSignupMemberToExistingMember({
                    signupMemberId: member.id,
                    existingMemberId: context.existingMember!.id,
                  })
                  if (result.error) {
                    toast.error(result.error)
                    return
                  }
                  toast.success('연결되었습니다.')
                  window.location.href = `/dashboard/members/${result.keepMemberId}`
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
