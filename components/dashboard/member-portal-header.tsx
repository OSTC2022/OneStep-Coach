'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, User as UserIcon } from 'lucide-react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationBell } from '@/components/dashboard/notification-bell'
import { MemberBoardPopover } from '@/components/dashboard/member-board-popover'
import { UserAvatar } from '@/components/dashboard/user-avatar'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { ShareWebsiteButton } from '@/components/pwa/share-website-button'
import type { User } from '@/lib/types'
import { toast } from 'sonner'

function portalTitle(pathname: string, hash: string): string {
  if (pathname.startsWith('/dashboard/my/profile')) return '프로필'
  if (pathname.startsWith('/dashboard/my/body')) {
    return hash === '#today-record' ? '오늘 기록' : '리포트'
  }
  if (pathname.startsWith('/dashboard/my/sessions')) return '수업'
  return '내 선수 리포트'
}

interface MemberPortalHeaderProps {
  user: User
}

export function MemberPortalHeader({ user }: MemberPortalHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [hash, setHash] = useState('')

  useEffect(() => {
    function syncHash() {
      setHash(window.location.hash)
    }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [pathname])

  const title = portalTitle(pathname, hash)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('로그아웃 되었습니다.')
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard/my" className="flex min-w-0 items-center gap-2.5">
          <BrandPulseAppIcon className="h-10 w-10" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold text-foreground">OneStep Athlete</p>
            <p className="truncate text-[11px] text-muted-foreground">{title}</p>
          </div>
        </Link>

        <div className="flex-1" />

        <MemberBoardPopover
          userId={user.id}
          kind="notice"
          audience={user.role === 'adult_member' ? 'adult' : 'general'}
        />
        <MemberBoardPopover
          userId={user.id}
          kind="event"
          audience={user.role === 'adult_member' ? 'adult' : 'general'}
        />

        <NotificationBell userId={user.id} />

        <ShareWebsiteButton />
        <InstallAppButton showLabel className="shrink-0" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="relative h-9 w-9 rounded-full p-0"
              aria-label="프로필 메뉴"
            >
              <UserAvatar user={user} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user.full_name || '사용자'}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/my/profile">
                <UserIcon className="mr-2 h-4 w-4" />
                <span>프로필 수정</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void handleSignOut()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>로그아웃</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
