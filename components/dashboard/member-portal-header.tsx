'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, User as UserIcon } from 'lucide-react'
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
import { MemberCenterContactHeaderButton } from '@/components/dashboard/member-center-contact-header-button'
import { UserAvatar } from '@/components/dashboard/user-avatar'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { ShareWebsiteButton } from '@/components/pwa/share-website-button'
import { ExportWebsiteButton } from '@/components/pwa/export-website-button'
import {
  DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL,
  DEFAULT_ADULT_RUNNING_PORTAL_TITLE,
} from '@/lib/running-league/adult-running-portal-defaults'
import type { User } from '@/lib/types'
import { toast } from 'sonner'

function portalTitle(pathname: string, hash: string, role?: string | null): string {
  const isAdult = role === 'adult_member'
  if (pathname.startsWith('/dashboard/my/running-league')) return '러닝 챌린지'
  if (pathname.startsWith('/dashboard/my/profile')) return '프로필'
  if (pathname.startsWith('/dashboard/my/body')) {
    return hash === '#today-record' ? (isAdult ? '컨디션' : '오늘 기록') : isAdult ? '컨디션' : '리포트'
  }
  if (pathname.startsWith('/dashboard/my/sessions')) return '수업'
  return isAdult ? DEFAULT_ADULT_RUNNING_PORTAL_TITLE : '내 선수 리포트'
}

function portalBrandLabel(role?: string | null): string {
  return role === 'adult_member' ? DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL : 'OneStep Athlete'
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

  const title = portalTitle(pathname, hash, user.role)
  const brandLabel = portalBrandLabel(user.role)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
    toast.success('로그아웃 되었습니다.')
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-1.5 px-3 sm:gap-2 sm:px-6 lg:px-8">
        <Link href="/dashboard/my" className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold text-foreground">{brandLabel}</p>
            <p className="truncate text-[11px] text-muted-foreground">{title}</p>
          </div>
        </Link>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <NotificationBell userId={user.id} />
          <ShareWebsiteButton />
          <ExportWebsiteButton />
          <InstallAppButton showLabel className="shrink-0 h-8 px-2.5 text-xs sm:text-sm" />
          <MemberCenterContactHeaderButton />

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
      </div>
    </header>
  )
}
