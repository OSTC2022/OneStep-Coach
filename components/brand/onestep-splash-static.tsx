/** HTML 파싱 직후 즉시 표시 — React hydration 전 커스텀 스플래시 */
import { SPLASH_BOOT_SCRIPT } from '@/lib/splash-boot'

export function OnestepSplashStatic() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: SPLASH_BOOT_SCRIPT,
        }}
      />
      <div
        id="onestep-app-splash"
        role="status"
        aria-live="polite"
        aria-label="로딩 중"
        className="onestep-app-splash fixed inset-0 z-[9999] flex w-full flex-col overflow-hidden bg-[#070d18] text-foreground"
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
              <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-primary/90 bg-[#0a1220]/80 shadow-[0_0_24px_rgba(170,255,0,0.25)]">
                <svg viewBox="0 0 24 24" className="h-9 w-9 text-primary" aria-hidden>
                  <path
                    d="M3 12h4l2.5-5 3.5 10 2.5-5H21"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="onestep-heartbeat"
                  />
                </svg>
              </div>
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
            <svg
              className="onestep-spinner h-full w-full"
              viewBox="0 0 50 50"
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
          <p className="onestep-loading-label min-w-[8.5rem] text-center text-[11px] font-semibold tracking-[0.32em] text-foreground/85">
            LOADING
          </p>
        </div>
      </div>
    </>
  )
}
