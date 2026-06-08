'use client'

import { useLayoutEffect, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  scheduleMemberPortalHashScroll,
  scrollMemberPortalToHash,
  scrollMemberPortalToTop,
} from '@/lib/member-portal-scroll'

export function MemberPortalScrollHandler() {
  const pathname = usePathname()
  const [hash, setHash] = useState('')

  useEffect(() => {
    const previous = history.scrollRestoration
    history.scrollRestoration = 'manual'
    return () => {
      history.scrollRestoration = previous
    }
  }, [])

  useEffect(() => {
    function syncHash() {
      setHash(window.location.hash)
    }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [pathname])

  useLayoutEffect(() => {
    if (!pathname.startsWith('/dashboard/my/body')) return

    scrollMemberPortalToTop(false)

    if (hash === '#today-record') {
      return scheduleMemberPortalHashScroll(hash, false)
    }

    scrollMemberPortalToHash(hash, false)
  }, [pathname, hash])

  return null
}
