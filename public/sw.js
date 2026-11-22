/* OneStep Coach — 잔여 워커 즉시 해제 (등록 금지) */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      } catch (_) {}
      try {
        await self.registration.unregister()
      } catch (_) {}
    })(),
  )
})
