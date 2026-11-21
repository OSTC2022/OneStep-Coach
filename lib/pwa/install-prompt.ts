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
 * 앱을 열 때마다(세션당 1회) 남아 있는 서비스 워커를 제거하고,
 * 컨트롤러가 있으면 새로고침해 "이 페이지를 읽을 수 없습니다" 를 막는다.
 */
export const SW_RECOVERY_SCRIPT = `(function(){try{window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();window.__onestepInstallPrompt=event;window.dispatchEvent(new Event("onestep-install-available"));});}catch(e){}try{if(!("serviceWorker"in navigator))return;var sk="onestep-sw-cleared-v6";if(sessionStorage.getItem(sk)==="1")return;navigator.serviceWorker.getRegistrations().then(function(regs){var list=regs||[];var hasController=!!navigator.serviceWorker.controller;if(!list.length&&!hasController){try{sessionStorage.setItem(sk,"1")}catch(e){}return}var jobs=list.map(function(reg){return reg.unregister()});if("caches"in window){jobs.push(caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k)}))}))}Promise.all(jobs).then(function(){try{sessionStorage.setItem(sk,"1")}catch(e){}if(hasController||list.length){location.reload()}}).catch(function(){try{sessionStorage.setItem(sk,"1")}catch(e){}})})}catch(e){}})();`

/** 서비스 워커를 등록하지 않고, 남아 있으면 계속 제거한다. */
export async function registerPwaServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))

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
