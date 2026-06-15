'use client'

import { useSyncExternalStore } from 'react'

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'
const MD_MEDIA_QUERY = '(min-width: 768px)'

function subscribe(query: string, onStoreChange: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

/** Tailwind `max-md` — mobile viewport (≤767px). SSR defaults to mobile. */
export function useIsMobileViewport() {
  return useSyncExternalStore(
    (onStoreChange) => subscribe(MOBILE_MEDIA_QUERY, onStoreChange),
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches,
    () => true,
  )
}

/** Tailwind `md` breakpoint (768px) and up */
export function useMinMd() {
  return useSyncExternalStore(
    (onStoreChange) => subscribe(MD_MEDIA_QUERY, onStoreChange),
    () => window.matchMedia(MD_MEDIA_QUERY).matches,
    () => false,
  )
}
