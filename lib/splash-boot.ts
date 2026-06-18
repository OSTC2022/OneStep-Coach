export function finishSplashBoot() {
  if (typeof document === 'undefined') return
  if (document.documentElement.dataset.onestepSplashDone === '1') return

  document.documentElement.dataset.onestepSplashDone = '1'
  document.documentElement.classList.remove('onestep-splash-active')
  document.documentElement.classList.add('onestep-app-ready')
  window.dispatchEvent(new Event('onestep-splash-finished'))
}

/**
 * 인라인 스크립트 — hydration 전 플래그만 설정.
 * 재방문·새로고침은 즉시 숨김(onestep-app-ready), 첫 방문만 스플래시 표시.
 */
export const SPLASH_BOOT_SCRIPT = `(function(){try{var skip=false;var nav=performance.getEntriesByType&&performance.getEntriesByType("navigation")[0];if(nav&&nav.type==="reload")skip=true;if(sessionStorage.getItem("onestep-splash-seen")==="1")skip=true;if(skip){window.__onestepSplashSkip=true;document.documentElement.classList.add("onestep-app-ready");return;}window.__onestepSplashStart=Date.now();sessionStorage.setItem("onestep-splash-seen","1");}catch(e){window.__onestepSplashStart=Date.now();}})();`

export const SPLASH_SESSION_KEY = 'onestep-splash-seen'

/** 첫 방문 스플래시 최소 표시 시간 (2~3초) */
export const SPLASH_MIN_VISIBLE_MS = 2800
export const SPLASH_FADE_MS = 450

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
