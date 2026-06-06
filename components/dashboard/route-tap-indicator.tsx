'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/** 메뉴 탭 후 화면이 바뀌는 동안 상단에 짧은 표시 (체감 속도) */
export function RouteTapIndicator() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)

  useEffect(() => {
    setActive(true)
    const t = window.setTimeout(() => setActive(false), 500)
    return () => window.clearTimeout(t)
  }, [pathname])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const anchor = (event.target as HTMLElement).closest(
        'a[href^="/dashboard"]',
      )
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href === pathname) return
      setActive(true)
    }

    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, {
        capture: true,
      })
  }, [pathname])

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-primary transition-opacity duration-150',
        active ? 'opacity-100' : 'opacity-0',
      )}
    />
  )
}
