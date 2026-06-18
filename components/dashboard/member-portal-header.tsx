'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Dumbbell, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { NotificationBell } from '@/components/dashboard/notification-bell'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { ShareWebsiteButton } from '@/components/pwa/share-website-button'
import type { User } from '@/lib/types'
import { toast } from 'sonner'

function portalTitle(pathname: string, hash: string): string {
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
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

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
    setSigningOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      toast.success('로그아웃 되었습니다.')
      setSignOutOpen(false)
      router.push('/auth/login')
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard/my"
          className="flex min-w-0 items-center gap-2.5"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Dumbbell className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold text-foreground">OneStep Athlete</p>
            <p className="truncate text-[11px] text-muted-foreground">{title}</p>
          </div>
        </Link>

        <div className="flex-1" />

        <NotificationBell userId={user.id} />

        <ShareWebsiteButton />
        <InstallAppButton />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => setSignOutOpen(true)}
          aria-label="로그아웃"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>로그아웃 하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              로그아웃하면 다시 로그인해야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>취소</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              {signingOut ? '로그아웃 중…' : '로그아웃'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
