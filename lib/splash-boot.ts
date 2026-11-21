export function finishSplashBoot() {
  if (typeof document === 'undefined') return
  if (document.documentElement.dataset.onestepSplashDone === '1') return

  document.documentElement.dataset.onestepSplashDone = '1'
  document.documentElement.classList.remove('onestep-splash-active')
  document.documentElement.classList.add('onestep-app-ready')

  try {
    sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
  } catch {
    /* ignore */
  }

  const node = document.getElementById('onestep-app-splash')
  if (node) node.remove()

  window.dispatchEvent(new Event('onestep-splash-finished'))
}

export const SPLASH_SESSION_KEY = 'onestep-splash-seen'

/**
 * 첫 실행만 브랜드 스플래시(흰 박스 없는 풀스크린).
 * 같은 탭에서는 바로 앱으로.
 */
export const SPLASH_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  SPLASH_SESSION_KEY,
)};if(sessionStorage.getItem(k)==="1"){window.__onestepSplashSkip=true;document.documentElement.classList.add("onestep-app-ready");}else{document.documentElement.classList.add("onestep-splash-active");window.__onestepSplashStart=Date.now();}}catch(e){document.documentElement.classList.add("onestep-splash-active");window.__onestepSplashStart=Date.now();}})();`

/** OS 기본 스플래시 직후 짧은 브랜드 화면 */
export const SPLASH_MIN_VISIBLE_MS = 520
export const SPLASH_FADE_MS = 240
export const SPLASH_MAX_WAIT_MS = 1600

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
