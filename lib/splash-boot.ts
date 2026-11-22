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

export const SPLASH_SESSION_KEY = 'onestep-splash-seen'

/** 오류 복구 중 — 인위적 스플래시/고정 오버레이 비활성 */
export const SPLASH_BOOT_SCRIPT = `(function(){try{window.__onestepSplashSkip=true;document.documentElement.classList.add("onestep-app-ready");}catch(e){}})();`

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
