'use client'

import { useEffect, useState } from 'react'
import { PWA_ASSET_VERSION } from '@/lib/pwa-splash-links'
import { shouldSkipSplashBoot } from '@/lib/splash-boot'

/** PC·모바일 공통 첫 페인트 — React로만 마운트/언마운트 (DOM 직접 remove 금지) */
export function SplashInlineBoot() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (shouldSkipSplashBoot()) {
      setVisible(false)
      return
    }

    function hide() {
      setVisible(false)
    }

    window.addEventListener('onestep-splash-finished', hide)
    if (document.documentElement.dataset.onestepSplashDone === '1') {
      setVisible(false)
    }
    return () => window.removeEventListener('onestep-splash-finished', hide)
  }, [])

  if (!visible) return null

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
            loading="eager"
            decoding="async"
          />
          <p className="onestep-splash-title">원스텝</p>
          <p className="onestep-splash-sub">One-Step Training Center</p>
        </div>
      </div>
    </div>
  )
}
