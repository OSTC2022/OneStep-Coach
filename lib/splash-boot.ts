/** 인라인 스크립트 — React 전에 첫 방문/새로고침 여부 판단 */
export const SPLASH_BOOT_SCRIPT = `(function(){try{var skip=false;var nav=performance.getEntriesByType&&performance.getEntriesByType("navigation")[0];if(nav&&nav.type==="reload")skip=true;if(sessionStorage.getItem("onestep-splash-seen")==="1")skip=true;if(skip){window.__onestepSplashSkip=true;document.documentElement.classList.add("onestep-app-ready");document.addEventListener("DOMContentLoaded",function(){var el=document.getElementById("onestep-app-splash");if(el)el.remove();});return;}window.__onestepSplashStart=Date.now();document.documentElement.classList.add("onestep-splash-active");sessionStorage.setItem("onestep-splash-seen","1");}catch(e){window.__onestepSplashStart=Date.now();document.documentElement.classList.add("onestep-splash-active");}})();`

export const SPLASH_SESSION_KEY = 'onestep-splash-seen'

export const SPLASH_MIN_VISIBLE_MS = 2500
export const SPLASH_FADE_MS = 500

export function shouldSkipSplashBoot(): boolean {
  if (typeof window === 'undefined') return false
  if (window.__onestepSplashSkip) return true
  if (document.documentElement.classList.contains('onestep-app-ready')) return true
  return false
}

export function finishSplashBoot(splash: HTMLElement | null) {
  document.documentElement.classList.remove('onestep-splash-active')
  document.documentElement.classList.add('onestep-app-ready')
  splash?.remove()
  window.dispatchEvent(new Event('onestep-splash-finished'))
}

declare global {
  interface Window {
    __onestepSplashStart?: number
    __onestepSplashSkip?: boolean
  }
}
