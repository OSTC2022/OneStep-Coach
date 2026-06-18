'use client'

import { useEffect, useState } from 'react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import {
  finishSplashBoot,
  shouldSkipSplashBoot,
  SPLASH_FADE_MS,
  SPLASH_MIN_VISIBLE_MS,
} from '@/lib/splash-boot'
import { cn } from '@/lib/utils'

/** 스플래시 표시 + 종료 — React 트리에서 언마운트 (DOM remove 금지) */
export function OnestepSplashLayer() {
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    if (shouldSkipSplashBoot()) {
      finishSplashBoot()
      setVisible(false)
      return
    }

    document.documentElement.classList.add('onestep-splash-active')

    const hideTimer = window.setTimeout(() => {
      setFadeOut(true)
      window.setTimeout(() => {
        finishSplashBoot()
        setVisible(false)
      }, SPLASH_FADE_MS)
    }, SPLASH_MIN_VISIBLE_MS)

    return () => {
      window.clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      id="onestep-app-splash"
      role="status"
      aria-live="polite"
      aria-label="로딩 중"
      className={cn(
        'onestep-app-splash fixed inset-0 z-[9999] flex w-full flex-col overflow-hidden bg-[#070d18] text-foreground',
        fadeOut && 'onestep-splash-fade-out',
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_88%_0%,rgba(170,255,0,0.1),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_92%,rgba(13,27,42,0.85),transparent_48%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(165deg,rgba(7,13,24,0.2)_0%,rgba(7,13,24,0.95)_55%)]" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <div className="flex w-full max-w-md items-center justify-center gap-1 sm:gap-3">
          <svg
            viewBox="0 0 140 20"
            className="h-4 w-28 shrink-0 scale-x-[-1] text-primary"
            aria-hidden
          >
            <defs>
              <linearGradient id="onestepPulseLeft" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                <stop offset="35%" stopColor="currentColor" stopOpacity="1" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 10 H24 L30 3 L38 17 L46 6 L54 10 H140"
              fill="none"
              stroke="url(#onestepPulseLeft)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="onestep-pulse-line"
            />
          </svg>

          <div className="flex shrink-0 flex-col items-center">
            <BrandPulseAppIcon glow className="h-20 w-20 translate-y-2" />
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">원스텝</p>
            <p className="mt-1 text-[11px] font-medium tracking-wide text-foreground/75">
              One-Step Training Center
            </p>
          </div>

          <svg
            viewBox="0 0 140 20"
            className="h-4 w-28 shrink-0 text-primary"
            aria-hidden
          >
            <defs>
              <linearGradient id="onestepPulseRight" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                <stop offset="35%" stopColor="currentColor" stopOpacity="1" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 10 H24 L30 3 L38 17 L46 6 L54 10 H140"
              fill="none"
              stroke="url(#onestepPulseRight)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="onestep-pulse-line"
            />
          </svg>
        </div>

        <div className="relative mt-8 px-7 py-2 text-sm font-medium text-foreground/90">
          <span className="absolute left-0 top-0 text-lg leading-none text-primary" aria-hidden>
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

      <div className="relative z-10 flex flex-col items-center gap-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="relative h-14 w-14" aria-hidden>
          <svg className="onestep-spinner h-full w-full" viewBox="0 0 50 50">
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
        <p className="onestep-loading-label min-w-[8.5rem] text-center text-[11px] font-semibold tracking-[0.32em] text-foreground/85">
          LOADING
        </p>
      </div>
    </div>
  )
}

/** @deprecated Use OnestepSplashLayer */
export const OnestepSplashStatic = OnestepSplashLayer

/** @deprecated Merged into OnestepSplashLayer */
export function AppInitialLoader() {
  return null
}
