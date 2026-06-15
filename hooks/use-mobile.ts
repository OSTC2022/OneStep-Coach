'use client'

import { useSyncExternalStore } from 'react'

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'

function subscribe(onStoreChange: () => void) {
  const media = window.matchMedia(MOBILE_MEDIA_QUERY)
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches,
    () => true,
  )
}
