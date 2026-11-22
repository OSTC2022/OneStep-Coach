import { PWA_ASSET_VERSION } from '@/lib/pwa-splash-links'

/** PC·모바일 공통 첫 페인트 — 동일 브랜드 화면 */
export function SplashInlineBoot() {
  return (
    <div
      id="onestep-app-splash"
      className="onestep-app-splash"
      role="status"
      aria-live="polite"
      aria-label="원스텝 로딩 중"
    >
      <div className="onestep-splash-atmosphere" aria-hidden>
        <div className="onestep-splash-glow" />
        <div className="onestep-splash-veil" />
      </div>

      <div className="onestep-splash-center">
        <div className="onestep-splash-enter">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="onestep-splash-mark-squircle"
            src={`/brand-pulse-icon.png?v=${PWA_ASSET_VERSION}`}
            alt=""
            width={112}
            height={112}
          />
          <p className="onestep-splash-title">원스텝</p>
          <p className="onestep-splash-sub">One-Step Training Center</p>
        </div>
      </div>
    </div>
  )
}
