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
  return deferredPrompt
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

/** 한 번만 기존 워커를 지우고 다시 연다. 빈 fetch 리스너에 막힌 설치 앱 복구용. */
export const SW_RECOVERY_SCRIPT = `(function(){try{if(!("serviceWorker"in navigator))return;var key="onestep-sw-reset-v3";if(localStorage.getItem(key)==="1")return;navigator.serviceWorker.getRegistrations().then(function(regs){if(!regs||!regs.length){localStorage.setItem(key,"1");return}localStorage.setItem(key,"1");Promise.all(regs.map(function(reg){return reg.unregister()})).then(function(){location.reload()})})}catch(e){}})();`

export async function registerPwaServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    await navigator.serviceWorker.register('/sw.js?v=onestep-v3', { scope: '/' })
    await navigator.serviceWorker.ready
  } catch {
    /* installability may still work on some browsers */
  }
}

export async function triggerPwaInstall(): Promise<
  'accepted' | 'dismissed' | 'unavailable'
> {
  await registerPwaServiceWorker()

  const prompt =
    getDeferredInstallPrompt() ?? (await waitForInstallPrompt(5000))

  if (!prompt) return 'unavailable'

  try {
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    deferredPrompt = null
    return outcome
  } catch {
    deferredPrompt = null
    return 'unavailable'
  }
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
