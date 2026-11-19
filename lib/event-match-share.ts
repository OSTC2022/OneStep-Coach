export const EVENT_MATCH_QUERY = 'eventMatch'

export function buildEventMatchShareUrl(
  eventId: string,
  path = '/dashboard/running-portal',
) {
  if (typeof window === 'undefined') {
    return `${path}?${EVENT_MATCH_QUERY}=${encodeURIComponent(eventId)}`
  }
  const url = new URL(path, window.location.origin)
  url.searchParams.set(EVENT_MATCH_QUERY, eventId)
  return url.toString()
}
