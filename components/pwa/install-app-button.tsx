'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  getDeferredInstallPrompt,
  isStandaloneDisplay,
  triggerPwaInstall,
} from '@/lib/pwa/install-prompt'
import { cn } from '@/lib/utils'

export function InstallAppButton({
  className,
  variant = 'outline',
  size = 'sm',
  showLabel = true,
}: {
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  /** false면 작은 화면에서 아이콘만 표시 */
  showLabel?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [canPrompt, setCanPrompt] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (isStandaloneDisplay()) {
      setHidden(true)
      return
    }

    function syncPrompt() {
      setCanPrompt(Boolean(getDeferredInstallPrompt()))
    }

    syncPrompt()
    window.addEventListener('beforeinstallprompt', syncPrompt)
    window.addEventListener('appinstalled', () => setHidden(true))

    return () => {
      window.removeEventListener('beforeinstallprompt', syncPrompt)
    }
  }, [])

  if (!mounted || hidden) return null

  async function handleInstall() {
    setInstalling(true)
    try {
      const outcome = await triggerPwaInstall()
      if (outcome === 'accepted') {
        toast.success('홈 화면에 추가되었습니다.')
        setHidden(true)
        return
      }
      if (outcome === 'dismissed') return
      toast.error('지금은 자동 설치를 사용할 수 없습니다.')
    } finally {
      setInstalling(false)
      setCanPrompt(Boolean(getDeferredInstallPrompt()))
    }
  }

  return (
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
      <Download className={cn('h-4 w-4 shrink-0', showLabel && 'mr-1.5')} />
      <span className={showLabel ? 'inline' : 'hidden sm:inline'}>
        {canPrompt ? '홈 화면 추가' : '앱 설치'}
      </span>
    </Button>
  )
}
