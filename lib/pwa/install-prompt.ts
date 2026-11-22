export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const waiters = new Set<(prompt: BeforeInstallPromptEvent | null) => void>()

function notifyWaiters(prompt: BeforeInstallPromptEvent | null) {
  for (const waiter of waiters) {
    waiter(prompt)
  }
  waiters.clear()
}

export function captureInstallPrompt(): () => void {
  if (typeof window === 'undefined') return () => {}

  function onBeforeInstall(event: Event) {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notifyWaiters(deferredPrompt)
  }

  function onInstalled() {
    deferredPrompt = null
  }

  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onInstalled)

  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onInstalled)
  }
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (deferredPrompt) return deferredPrompt
  if (typeof window === 'undefined') return null
  const early = (window as Window & { __onestepInstallPrompt?: BeforeInstallPromptEvent })
    .__onestepInstallPrompt
  return early ?? null
}

export function waitForInstallPrompt(timeoutMs = 5000): Promise<BeforeInstallPromptEvent | null> {
  if (deferredPrompt) return Promise.resolve(deferredPrompt)

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      waiters.delete(done)
      resolve(null)
    }, timeoutMs)

    function done(prompt: BeforeInstallPromptEvent | null) {
      window.clearTimeout(timer)
      waiters.delete(done)
      resolve(prompt)
    }

    waiters.add(done)
  })
}

/**
 * 자동 location.reload 금지 — 반복 “페이지를 읽을 수 없습니다 / 다시 로드” 유발.
 * clients.claim 도 금지. 등록된 SW는 해제만 하고, 가능하면 새 SW를 올리지 않는다.
 * (구형 컨트롤러가 남을 때만 킬러 SW를 한 번 올려 교체 — claim 없는 sw.js)
 */
export const SW_RECOVERY_SCRIPT = `(function(){try{window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();window.__onestepInstallPrompt=event;window.dispatchEvent(new Event("onestep-install-available"));});}catch(e){}try{if(!("serviceWorker"in navigator))return;var once="onestep-sw-kill-v9";if(sessionStorage.getItem(once)==="1")return;sessionStorage.setItem(once,"1");function clearCaches(){if(!("caches"in window))return Promise.resolve();return caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k)}))})}navigator.serviceWorker.getRegistrations().then(function(regs){var list=regs||[];return Promise.all(list.map(function(reg){return reg.unregister()})).then(function(){if(!navigator.serviceWorker.controller)return null;return navigator.serviceWorker.register("/sw.js?v=onestep-kill-v9",{scope:"/"}).catch(function(){return null})}).then(function(){return clearCaches()})}).catch(function(){})}catch(e){}})();`

/**
 * 서비스 워커를 유지하지 않는다. 자동 새로고침·clients.claim 은 하지 않는다.
 */
export async function registerPwaServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))

    // 이미 해제했는데도 이전 컨트롤러가 남아 있으면 킬러 SW로만 교체 (claim 없음)
    if (navigator.serviceWorker.controller) {
      try {
        await navigator.serviceWorker.register('/sw.js?v=onestep-kill-v9', {
          scope: '/',
        })
        const after = await navigator.serviceWorker.getRegistrations()
        await Promise.all(after.map((registration) => registration.unregister()))
      } catch {
        /* ignore */
      }
    }

    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    /* ignore */
  }
}

export async function triggerPwaInstall(): Promise<
  'accepted' | 'dismissed' | 'unavailable'
> {
  const prompt = getDeferredInstallPrompt()
  if (!prompt) return 'unavailable'

  try {
    const shown = prompt.prompt()
    deferredPrompt = null
    if (typeof window !== 'undefined') {
      ;(window as Window & { __onestepInstallPrompt?: BeforeInstallPromptEvent | null })
        .__onestepInstallPrompt = null
    }
    await shown
    const { outcome } = await prompt.userChoice
    return outcome
  } catch {
    deferredPrompt = null
    return 'unavailable'
  }
}

export function installGuideMessage(): string {
  if (typeof navigator === 'undefined') {
    return '브라우저 메뉴에서 홈 화면에 추가해 주세요.'
  }
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  if (iOS) {
    return 'Safari에서 공유 버튼을 누른 뒤 "홈 화면에 추가"를 선택해 주세요.'
  }
  return '브라우저 메뉴(⋮)에서 "앱 설치" 또는 "홈 화면에 추가"를 선택해 주세요.'
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
