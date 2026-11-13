export function finishSplashBoot() {
  if (typeof document === 'undefined') return
  if (document.documentElement.dataset.onestepSplashDone === '1') return

  document.documentElement.dataset.onestepSplashDone = '1'
  document.documentElement.classList.remove('onestep-splash-active')
  document.documentElement.classList.add('onestep-app-ready')
  window.dispatchEvent(new Event('onestep-splash-finished'))
}

/**
 * 인라인 스크립트 — 첫 페인트 전에 스플래시를 건너뜀.
 * 로딩 오버레이가 본 화면 앞에 남지 않게 한다.
 */
export const SPLASH_BOOT_SCRIPT = `(function(){try{window.__onestepSplashSkip=true;document.documentElement.classList.add("onestep-app-ready");}catch(e){}})();`

export const SPLASH_SESSION_KEY = 'onestep-splash-seen'

/** 로딩 오버레이는 표시하지 않음 */
export const SPLASH_MIN_VISIBLE_MS = 0
export const SPLASH_FADE_MS = 220

export function shouldSkipSplashBoot(): boolean {
  if (typeof window === 'undefined') return false
  if (window.__onestepSplashSkip) return true
  if (document.documentElement.dataset.onestepSplashDone === '1') return true
  if (document.documentElement.classList.contains('onestep-app-ready')) return true
  return false
}

declare global {
  interface Window {
    __onestepSplashStart?: number
    __onestepSplashSkip?: boolean
  }
}
