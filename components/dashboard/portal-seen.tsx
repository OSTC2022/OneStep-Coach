'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { rememberItemIds, unseenItemIds } from '@/lib/portal-item-seen'

const PortalViewerContext = createContext<string | null>(null)

export function PortalViewerProvider({
  viewerId,
  children,
}: {
  viewerId: string | null
  children: ReactNode
}) {
  return <PortalViewerContext.Provider value={viewerId}>{children}</PortalViewerContext.Provider>
}

export function usePortalViewerId() {
  return useContext(PortalViewerContext)
}

/** 이번 방문에서만 N을 남기고, 계정 저장소에는 읽음으로 기록한다. */
export function useMarkPortalItemsRead(ids: string[]) {
  const viewerId = usePortalViewerId()
  const key = ids.join('\n')
  const [freshIds, setFreshIds] = useState<string[]>([])

  useEffect(() => {
    if (!viewerId) return
    const list = key ? key.split('\n') : []
    const unseen = unseenItemIds(viewerId, list)
    setFreshIds(unseen)
    const timer = window.setTimeout(() => rememberItemIds(viewerId, list), 0)
    return () => window.clearTimeout(timer)
  }, [key, viewerId])

  return freshIds
}
