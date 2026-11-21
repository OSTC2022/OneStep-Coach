/** 첫 페인트 — 흰 박스 없이 풀스크린 브랜드 화면 */
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
            src="/brand-pulse-icon.png?v=16"
            alt=""
            width={96}
            height={96}
          />
          <p className="onestep-splash-title">원스텝</p>
          <p className="onestep-splash-sub">One-Step Training Center</p>
        </div>
      </div>
    </div>
  )
}
