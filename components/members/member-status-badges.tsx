'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ACCOUNT_LINK_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  MEMBER_SOURCE_HINTS,
  MEMBER_SOURCE_LABELS,
  computeMembershipStatus,
  resolveAccountLinkStatus,
  resolveSourceType,
  type MemberAccountLinkStatus,
  type MemberMembershipStatus,
  type MemberSourceType,
} from '@/lib/member-account-status'

type MemberLike = {
  source_type?: MemberSourceType | null
  account_link_status?: MemberAccountLinkStatus | null
  membership_status?: MemberMembershipStatus | null
  remaining_sessions?: number | null
  auth_user_id?: string | null
  user_id?: string | null
  memo?: string | null
}

function sourceVariant(source: MemberSourceType) {
  return source === 'self_signup' ? 'default' : 'secondary'
}

function membershipVariant(status: MemberMembershipStatus) {
  if (status === 'active') return 'default'
  if (status === 'expired') return 'outline'
  if (status === 'pending') return 'secondary'
  return 'outline'
}

function linkVariant(status: MemberAccountLinkStatus) {
  if (status === 'duplicate_candidate') return 'destructive'
  if (status === 'unlinked') return 'secondary'
  if (status === 'dismissed') return 'outline'
  return 'outline'
}

export function MemberStatusBadges({
  member,
  className,
  compact = false,
}: {
  member: MemberLike
  className?: string
  compact?: boolean
}) {
  const source = resolveSourceType(member)
  const link = resolveAccountLinkStatus(member)
  const membership =
    member.membership_status ??
    computeMembershipStatus({
      remainingSessionsCache: member.remaining_sessions ?? 0,
    })

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1',
        compact ? 'mt-0.5' : 'mt-1',
        className,
      )}
      title={[MEMBER_SOURCE_HINTS[source], MEMBERSHIP_STATUS_LABELS[membership], ACCOUNT_LINK_LABELS[link]].join(' · ')}
    >
      <Badge variant={sourceVariant(source)} className="text-[10px] font-normal">
        {MEMBER_SOURCE_LABELS[source]}
      </Badge>
      <Badge variant={membershipVariant(membership)} className="text-[10px] font-normal">
        {membership === 'active'
          ? '회원권 있음'
          : membership === 'expired'
            ? '만료됨'
            : membership === 'pending'
              ? '확인 필요'
              : '회원권 없음'}
      </Badge>
      <Badge variant={linkVariant(link)} className="text-[10px] font-normal">
        {ACCOUNT_LINK_LABELS[link]}
      </Badge>
      {link === 'duplicate_candidate' ? (
        <Badge variant="destructive" className="text-[10px] font-normal">
          확인 필요
        </Badge>
      ) : null}
    </div>
  )
}
