'use client'

import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { cn } from '@/lib/utils'

function SplashAtmosphere() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.34]"
        style={{ backgroundImage: "url('/images/onestep-splash-bg.png')" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_32%,rgba(170,255,0,0.16),transparent_52%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(7,13,24,0.2),#070d18_62%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,13,24,0.55)_0%,rgba(7,13,24,0.2)_28%,rgba(7,13,24,0.55)_72%,#070d18_100%)]"
        aria-hidden
      />
    </>
  )
}

function BrandPulseRing() {
  return (
    <div className="relative flex h-[7.25rem] w-[7.25rem] items-center justify-center">
      <span
        className="onestep-splash-ring absolute inset-0 rounded-full border border-primary/25"
        aria-hidden
      />
      <span
        className="onestep-splash-ring-delayed absolute inset-[-10%] rounded-full border border-primary/12"
        aria-hidden
      />
      <BrandPulseAppIcon glow className="onestep-splash-mark h-[4.75rem] w-[4.75rem]" />
    </div>
  )
}

function SplashProgress() {
  return (
    <div className="flex w-full max-w-[13rem] flex-col items-center gap-3 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div
        className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/10"
        aria-hidden
      >
        <span className="onestep-splash-progress absolute inset-y-0 left-0 w-1/2 rounded-full bg-primary" />
      </div>
      <p className="text-[11px] font-medium tracking-[0.28em] text-white/55">
        시작 준비 중
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
      aria-label="원스텝 로딩 중"
      className={cn(
        'relative flex min-h-svh w-full flex-col overflow-hidden bg-[#070d18] text-white',
        fixed && 'fixed inset-0 z-[9999]',
        fading && 'onestep-splash-fade-out',
        className,
      )}
    >
      <SplashAtmosphere />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <div className="onestep-splash-enter flex flex-col items-center">
          <BrandPulseRing />

          <p className="mt-7 font-[family-name:var(--font-portal-blackhan)] text-[2.35rem] leading-none tracking-tight text-white sm:text-[2.6rem]">
            원스텝
          </p>
          <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.34em] text-white/58">
            One-Step Training Center
          </p>

          <div className="mt-6 flex items-center gap-3 text-[12px] font-medium tracking-wide text-white/72">
            <span className="h-px w-7 bg-primary/70" aria-hidden />
            러닝 &amp; 트레이닝
            <span className="h-px w-7 bg-primary/70" aria-hidden />
          </div>
        </div>
      </div>

      <div className="relative z-10 flex justify-center px-6">
        <SplashProgress />
      </div>
    </div>
  )
}
