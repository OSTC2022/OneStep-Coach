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

  // React가 관리하는 #onestep-app-splash 를 DOM에서 직접 remove 하면
  // 이후 라우트 이동 때 insertBefore/removeChild NotFoundError 가 난다.
  // 숨김은 html.onestep-app-ready CSS 만 사용한다.

  window.dispatchEvent(new Event('onestep-splash-finished'))
}

export const SPLASH_SESSION_KEY = 'onestep-splash-seen'

/**
 * PC·모바일 공통 첫 화면.
 * 같은 탭에서는 한 번만 보여 준다. (자동 reload 없음)
 */
export const SPLASH_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  SPLASH_SESSION_KEY,
)};if(sessionStorage.getItem(k)==="1"){window.__onestepSplashSkip=true;document.documentElement.classList.add("onestep-app-ready");}else{document.documentElement.classList.add("onestep-splash-active");window.__onestepSplashStart=Date.now();}}catch(e){document.documentElement.classList.add("onestep-splash-active");window.__onestepSplashStart=Date.now();}})();`

export const SPLASH_MIN_VISIBLE_MS = 480
export const SPLASH_FADE_MS = 220
export const SPLASH_MAX_WAIT_MS = 1400

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
