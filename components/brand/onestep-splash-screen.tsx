'use client'

import { useEffect, useId, useState } from 'react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { cn } from '@/lib/utils'

function PulseLine({ mirrored }: { mirrored?: boolean }) {
  const gradientId = useId()

  return (
    <svg
      viewBox="0 0 140 20"
      className={cn('h-4 w-28 shrink-0 text-primary', mirrored && 'scale-x-[-1]')}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="35%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 10 H24 L30 3 L38 17 L46 6 L54 10 H140"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="onestep-pulse-line"
      />
    </svg>
  )
}

function LogoMark() {
  return (
    <div className="flex shrink-0 flex-col items-center">
      <BrandPulseAppIcon glow className="h-20 w-20 translate-y-2" />
      <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">원스텝</p>
      <p className="mt-1 text-[11px] font-medium tracking-wide text-foreground/75">
        One-Step Training Center
      </p>
    </div>
  )
}

function SplashLoader() {
  const [dots, setDots] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDots((value) => (value + 1) % 4)
    }, 420)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="relative h-14 w-14" aria-hidden>
        <svg
          className="h-full w-full animate-spin"
          viewBox="0 0 50 50"
          style={{ animationDuration: '1.1s' }}
        >
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            className="text-white/12"
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="36 89.5"
            className="text-primary"
            transform="rotate(-90 25 25)"
          />
        </svg>
      </div>
      <p className="min-w-[8.5rem] text-center text-[11px] font-semibold tracking-[0.32em] text-foreground/85">
        LOADING{'.'.repeat(dots)}
      </p>
    </div>
  )
}

type OnestepSplashScreenProps = {
  fading?: boolean
  fixed?: boolean
  className?: string
}

export function OnestepSplashScreen({
  fading = false,
  fixed = false,
  className,
}: OnestepSplashScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="로딩 중"
      className={cn(
        'relative flex min-h-svh w-full flex-col overflow-hidden bg-[#070d18] text-foreground',
        fixed && 'fixed inset-0 z-[9999]',
        fading && 'pointer-events-none opacity-0 transition-opacity duration-500',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_88%_0%,rgba(170,255,0,0.1),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_92%,rgba(13,27,42,0.85),transparent_48%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(165deg,rgba(7,13,24,0.2)_0%,rgba(7,13,24,0.95)_55%)]" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <div className="flex w-full max-w-md items-center justify-center gap-1 sm:gap-3">
          <PulseLine />
          <LogoMark />
          <PulseLine mirrored />
        </div>

        <div className="relative mt-8 px-7 py-2 text-sm font-medium text-foreground/90">
          <span
            className="absolute left-0 top-0 text-lg leading-none text-primary"
            aria-hidden
          >
            「
          </span>
          러닝 &amp; 트레이닝 센터
          <span
            className="absolute bottom-0 right-0 text-lg leading-none text-primary"
            aria-hidden
          >
            」
          </span>
        </div>
      </div>

      <div className="relative z-10">
        <SplashLoader />
      </div>
    </div>
  )
}
