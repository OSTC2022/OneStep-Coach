/** 서버에서 바로 그리는 첫 페인트 스플래시 (하이드레이션 전에도 보임) */
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
        <div className="onestep-splash-bg" />
        <div className="onestep-splash-glow" />
        <div className="onestep-splash-veil" />
      </div>

      <div className="onestep-splash-center">
        <div className="onestep-splash-enter">
          <div className="onestep-splash-ring-wrap">
            <span className="onestep-splash-ring" />
            <span className="onestep-splash-ring onestep-splash-ring-delayed" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="onestep-splash-mark"
              src="/brand-pulse-icon.png?v=11"
              alt=""
              width={76}
              height={76}
            />
          </div>
          <p className="onestep-splash-title">원스텝</p>
          <p className="onestep-splash-sub">One-Step Training Center</p>
          <p className="onestep-splash-tag">
            <span />
            러닝 & 트레이닝
            <span />
          </p>
        </div>
      </div>

      <div className="onestep-splash-footer">
        <div className="onestep-splash-bar">
          <span className="onestep-splash-progress" />
        </div>
        <p className="onestep-splash-caption">시작 준비 중</p>
      </div>
    </div>
  )
}
