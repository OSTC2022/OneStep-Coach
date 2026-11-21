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

/**
 * 인라인 스크립트 — 첫 페인트 전에 스플래시 표시 여부 결정.
 * 같은 탭에서 이미 본 경우엔 바로 앱을 연다.
 */
export const SPLASH_SESSION_KEY = 'onestep-splash-seen'

export const SPLASH_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  SPLASH_SESSION_KEY,
)};if(sessionStorage.getItem(k)==="1"){window.__onestepSplashSkip=true;document.documentElement.classList.add("onestep-app-ready");}else{document.documentElement.classList.add("onestep-splash-active");window.__onestepSplashStart=Date.now();}}catch(e){document.documentElement.classList.add("onestep-splash-active");window.__onestepSplashStart=Date.now();}})();`

/** 첫 진입 시 브랜드 스플래시를 잠깐 보여 줌 */
export const SPLASH_MIN_VISIBLE_MS = 1100
export const SPLASH_FADE_MS = 320
export const SPLASH_MAX_WAIT_MS = 2800

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
