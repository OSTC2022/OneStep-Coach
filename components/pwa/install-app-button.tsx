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

function isAndroidDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /android/i.test(window.navigator.userAgent)
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
  const [mounted, setMounted] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    setMounted(true)
    if (isStandaloneDisplay()) {
      setHidden(true)
      return
    }

    function onBeforeInstall(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    function onInstalled() {
      setHidden(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!mounted || hidden) return null

  async function handleInstall() {
    if (deferredPrompt) {
      setInstalling(true)
      try {
        await deferredPrompt.prompt()
        const choice = await deferredPrompt.userChoice
        if (choice.outcome === 'accepted') {
          toast.success('홈 화면에 추가되었습니다.')
          setHidden(true)
        }
      } catch {
        setGuideOpen(true)
      } finally {
        setInstalling(false)
        setDeferredPrompt(null)
      }
      return
    }

    setGuideOpen(true)
  }

  const guideTitle = isIosDevice()
    ? 'iPhone · iPad 홈 화면 추가'
    : isAndroidDevice()
      ? 'Android 홈 화면 추가'
      : 'PC · 브라우저 홈 화면 추가'

  const guideSteps = isIosDevice()
    ? [
        '하단 공유 버튼을 누릅니다.',
        '「홈 화면에 추가」를 선택합니다.',
        '오른쪽 상단 「추가」를 누릅니다.',
      ]
    : isAndroidDevice()
      ? [
          '주소창 오른쪽 메뉴(⋮)를 누릅니다.',
          '「앱 설치」 또는 「홈 화면에 추가」를 선택합니다.',
          '안내에 따라 추가를 완료합니다.',
        ]
      : [
          '주소창 오른쪽의 설치 아이콘(⊕)을 누르거나',
          '브라우저 메뉴(⋮)에서 「앱 설치」를 선택합니다.',
          'Chrome · Edge에서 가장 잘 동작합니다.',
        ]

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
        title="홈 화면에 추가"
      >
        <Download className="h-4 w-4 sm:mr-1.5" />
        <span className="hidden sm:inline">홈 화면 추가</span>
      </Button>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              {guideTitle}
            </DialogTitle>
            <DialogDescription asChild>
              <ol className="mt-2 list-decimal space-y-2 pl-4 text-left text-sm text-muted-foreground">
                {guideSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  )
}
