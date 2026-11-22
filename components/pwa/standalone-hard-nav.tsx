'use client'

import { useEffect } from 'react'
import { isStandaloneDisplay } from '@/lib/pwa/install-prompt'

/**
 * 설치 앱(standalone)에서는 Next 클라이언트 라우팅 대신 전체 이동을 쓴다.
 * (서비스 워커/WebAPK 환경에서 soft navigation 시
 *  "이 페이지를 읽을 수 없습니다" 가 반복되는 문제 완화)
 */
export function StandaloneHardNav() {
  useEffect(() => {
    if (!isStandaloneDisplay()) return

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

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
      // 같은 페이지 해시만 바꾸면 그대로 둔다
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
