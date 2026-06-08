export const MEMBER_PORTAL_MAIN_ID = 'member-portal-main'

/** Sticky portal header (h-14) + small breathing room */
export const MEMBER_PORTAL_SCROLL_OFFSET = 72

export function getMemberPortalScrollContainer(): HTMLElement | null {
  return document.getElementById(MEMBER_PORTAL_MAIN_ID)
}

export function resolveMemberPortalScrollTarget(hash: string): string {
  if (hash === '#today-record') return '#today-record-top'
  if (!hash || hash === '#report-top') return ''
  return hash
}

export function scrollMemberPortalToTop(smooth = false) {
  const container = getMemberPortalScrollContainer()
  if (container) {
    container.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
    return
  }
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
}

export function scrollMemberPortalToElement(
  element: Element,
  smooth = false,
  offset = MEMBER_PORTAL_SCROLL_OFFSET,
) {
  const container = getMemberPortalScrollContainer()
  if (container) {
    const containerRect = container.getBoundingClientRect()
    const targetRect = element.getBoundingClientRect()
    const top =
      container.scrollTop + (targetRect.top - containerRect.top) - offset

    container.scrollTo({
      top: Math.max(0, top),
      behavior: smooth ? 'smooth' : 'auto',
    })
    return
  }

  const top = window.scrollY + element.getBoundingClientRect().top - offset
  window.scrollTo({
    top: Math.max(0, top),
    behavior: smooth ? 'smooth' : 'auto',
  })
}

export function scrollMemberPortalToHash(hash: string, smooth = true) {
  const targetSelector = resolveMemberPortalScrollTarget(hash)
  if (!targetSelector) {
    scrollMemberPortalToTop(smooth)
    return
  }

  const target = document.querySelector(targetSelector)
  if (target) {
    scrollMemberPortalToElement(target, smooth)
  }
}

export function scheduleMemberPortalHashScroll(
  hash: string,
  smooth = false,
): () => void {
  const run = () => scrollMemberPortalToHash(hash, smooth)
  run()

  const raf = requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
  const timers = [50, 200, 450].map((delay) => window.setTimeout(run, delay))

  const container = getMemberPortalScrollContainer()
  let resizeObserver: ResizeObserver | null = null
  if (container && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(run)
    resizeObserver.observe(container)
  }
  const stopObserver = window.setTimeout(() => resizeObserver?.disconnect(), 600)

  return () => {
    cancelAnimationFrame(raf)
    timers.forEach((timer) => window.clearTimeout(timer))
    window.clearTimeout(stopObserver)
    resizeObserver?.disconnect()
  }
}
