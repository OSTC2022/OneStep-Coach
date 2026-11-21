export function finishSplashBoot() {
  if (typeof document === 'undefined') return
  if (document.documentElement.dataset.onestepSplashDone === '1') return

  document.documentElement.dataset.onestepSplashDone = '1'
  document.documentElement.classList.remove('onestep-splash-active')
  document.documentElement.classList.add('onestep-app-ready')

  const node = document.getElementById('onestep-app-splash')
  if (node) node.remove()

  window.dispatchEvent(new Event('onestep-splash-finished'))
}

/**
 * 인라인 스크립트 — 인위적인 로딩 오버레이를 쓰지 않는다.
 * (Android 기본 스플래시 + 추가 1초 오버레이가 겹치면 전문감이 떨어짐)
 */
export const SPLASH_SESSION_KEY = 'onestep-splash-seen'

export const SPLASH_BOOT_SCRIPT = `(function(){try{window.__onestepSplashSkip=true;document.documentElement.classList.add("onestep-app-ready");}catch(e){}})();`

/** 오버레이 스플래시 미사용 */
export const SPLASH_MIN_VISIBLE_MS = 0
export const SPLASH_FADE_MS = 180
export const SPLASH_MAX_WAIT_MS = 0

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
