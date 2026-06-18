'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

function profileInitial(user: {
  full_name?: string | null
  email?: string | null
}) {
  return user.full_name?.charAt(0) || user.email?.charAt(0) || '?'
}

interface UserAvatarProps {
  user: {
    full_name?: string | null
    email?: string | null
    avatar_url?: string | null
  }
  className?: string
  fallbackClassName?: string
}

export function UserAvatar({ user, className, fallbackClassName }: UserAvatarProps) {
  return (
    <Avatar className={cn('h-9 w-9', className)}>
      {user.avatar_url ? (
        <AvatarImage src={user.avatar_url} alt={user.full_name ?? '프로필'} />
      ) : null}
      <AvatarFallback
        className={cn(
          'bg-primary/20 text-sm font-medium text-primary',
          fallbackClassName,
        )}
      >
        {profileInitial(user)}
      </AvatarFallback>
    </Avatar>
  )
}
