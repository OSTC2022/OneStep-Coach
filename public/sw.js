/* OneStep Coach — 잔여 워커 자동 해제.
 * fetch / clients.claim / client.navigate 금지.
 * 등록돼 있어도 즉시 unregister 한다.
 */
const SW_VERSION = 'onestep-v6'
self.__SW_VERSION = SW_VERSION

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      } catch (_) {
        /* ignore */
      }
      try {
        await self.registration.unregister()
      } catch (_) {
        /* ignore */
      }
    })(),
  )
})
