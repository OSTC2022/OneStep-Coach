/* OneStep Coach — “킬러” 워커.
 * 옛 워커를 교체한 뒤 캐시를 비우고 자기 자신을 등록 해제한다.
 * fetch 리스너 / client.navigate 없음.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.clients.claim()
      } catch (_) {}
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
