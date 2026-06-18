'use client'

import { useEffect, useState } from 'react'
import { Download, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export function InstallAppButton({
  className,
  variant = 'outline',
  size = 'sm',
}: {
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
}) {
  const [visible, setVisible] = useState(false)
  const [iosGuideOpen, setIosGuideOpen] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandaloneDisplay()) return

    function onBeforeInstall(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    if (isIosDevice()) {
      setVisible(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    }
  }, [])

  if (!visible) return null

  async function handleInstall() {
    if (deferredPrompt) {
      setInstalling(true)
      try {
        await deferredPrompt.prompt()
        const choice = await deferredPrompt.userChoice
        if (choice.outcome === 'accepted') {
          toast.success('홈 화면에 추가되었습니다.')
          setVisible(false)
        }
      } catch {
        toast.error('설치에 실패했습니다. 브라우저 메뉴에서 다시 시도해주세요.')
      } finally {
        setInstalling(false)
        setDeferredPrompt(null)
      }
      return
    }

    if (isIosDevice()) {
      setIosGuideOpen(true)
      return
    }

    toast.message('앱 설치', {
      description:
        '주소창 오른쪽 메뉴(⋮)에서 「앱 설치」 또는 「홈 화면에 추가」를 선택해주세요.',
      duration: 8000,
    })
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={installing}
        onClick={() => void handleInstall()}
        aria-label="홈 화면에 추가"
      >
        <Download className="h-4 w-4 sm:mr-1.5" />
        <span className="hidden sm:inline">홈 화면 추가</span>
      </Button>

      <Dialog open={iosGuideOpen} onOpenChange={setIosGuideOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              홈 화면에 추가
            </DialogTitle>
            <DialogDescription asChild>
              <ol className="mt-2 list-decimal space-y-2 pl-4 text-left text-sm text-muted-foreground">
                <li>하단 <strong className="text-foreground">공유</strong> 버튼을 누릅니다.</li>
                <li>
                  <strong className="text-foreground">홈 화면에 추가</strong>를 선택합니다.
                </li>
                <li>오른쪽 상단 <strong className="text-foreground">추가</strong>를 누릅니다.</li>
              </ol>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  )
}
