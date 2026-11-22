/* OneStep Coach — “킬러” 워커.
 * 옛 워커를 교체한 뒤 캐시를 비우고 자기 자신을 등록 해제한다.
 * fetch / respondWith / client.navigate / clients.claim 금지.
 * clients.claim() 은 클릭·화면 이동 중 요청을 끊으며
 * “이 페이지를 읽을 수 없습니다” 를 유발한다.
 */
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
