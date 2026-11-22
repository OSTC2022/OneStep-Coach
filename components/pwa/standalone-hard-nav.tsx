'use client'

import { useEffect } from 'react'
import { isStandaloneDisplay } from '@/lib/pwa/install-prompt'

/**
 * 설치 앱 + 서비스 워커가 아직 페이지를 잡고 있을 때만 내부 링크를 전체 이동.
 * SW 컨트롤러가 없으면 Next soft navigation 을 그대로 쓴다.
 * (불필요한 hard nav / claim 중 hard nav 가 “읽을 수 없습니다” 를 키움)
 */
export function StandaloneHardNav() {
  useEffect(() => {
    if (!isStandaloneDisplay()) return

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      // SW가 없으면 soft nav가 안전하다
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) return

      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      if (
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:')
      ) {
        return
      }

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }

      if (url.origin !== window.location.origin) return
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      window.location.assign(url.pathname + url.search + url.hash)
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
