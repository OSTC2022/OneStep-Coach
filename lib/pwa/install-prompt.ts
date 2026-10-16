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

/** 한 번만 기존 워커를 지우고, 설치 이벤트는 페이지 스크립트보다 먼저 잡아 둔다. */
export const SW_RECOVERY_SCRIPT = `(function(){try{window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();window.__onestepInstallPrompt=event;window.dispatchEvent(new Event("onestep-install-available"));});}catch(e){}try{if(!("serviceWorker"in navigator))return;var key="onestep-sw-reset-v3";if(localStorage.getItem(key)==="1")return;navigator.serviceWorker.getRegistrations().then(function(regs){if(!regs||!regs.length){localStorage.setItem(key,"1");return}localStorage.setItem(key,"1");Promise.all(regs.map(function(reg){return reg.unregister()})).then(function(){location.reload()})})}catch(e){}})();`

export async function registerPwaServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    await navigator.serviceWorker.register('/sw.js?v=onestep-v4', { scope: '/' })
    await navigator.serviceWorker.ready
  } catch {
    /* installability may still work on some browsers */
  }
}

export async function triggerPwaInstall(): Promise<
  'accepted' | 'dismissed' | 'unavailable'
> {
  const prompt = getDeferredInstallPrompt()
  if (!prompt) return 'unavailable'

  try {
    // prompt()는 클릭 직후, await 전에 호출해야 브라우저가 설치 창을 연다.
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
